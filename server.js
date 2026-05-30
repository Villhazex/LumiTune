const express=require('express');
const {spawn,execFile}=require('child_process');
const path=require('path');
const fs=require('fs');

const open = (...args) =>
  import("open").then(({ default: open }) => open(...args));


const app=express();
const PORT=3001;
const BIN=path.join(require.resolve('yt-dlp-exec/package.json'),'..','bin','yt-dlp.exe');
const YT_DOWNLOAD_DIR=path.join(__dirname,'yt-downloads');



app.use((req,res,next)=>{res.header('Access-Control-Allow-Origin','*');next();});
app.use(express.static(__dirname));

app.get('/api/ping',(req,res)=>res.json({ok:true}));

function ytRun(args){
  return new Promise((resolve,reject)=>{
    execFile(BIN,args,{maxBuffer:50*1024*1024},(err,stdout,stderr)=>{
      if(err)return reject(new Error(stderr.slice(0,500)||err.message));
      try{resolve(JSON.parse(stdout))}catch(e){reject(new Error('Invalid JSON output'))}
    });
  });
}

app.get('/api/info',async(req,res)=>{
  try{
    const info=await ytRun([
      req.query.url,'--dump-json','--no-check-certificates','--no-warnings',
      '--skip-download'
    ]);
    res.json({title:info.title,author_name:info.uploader||info.channel||'',thumbnail_url:info.thumbnail,format:info.ext,duration:info.duration});
  }catch(e){res.status(500).json({error:e.message});}
});

app.get('/api/download',async(req,res)=>{
  try{
    const info=await ytRun([
      req.query.url,'--dump-json','--no-check-certificates','--no-warnings',
      '--prefer-free-formats','--skip-download'
    ]);
    const af=info.formats.filter(f=>f.resolution==='audio only'&&f.filesize);
    if(!af.length)return res.status(500).json({error:'No audio-only format found'});
    af.sort((a,b)=>(b.filesize||0)-(a.filesize||0));
    const best=af[0];
    const ext=best.ext||'m4a';
    const ct={'m4a':'audio/mp4','webm':'audio/webm','mp3':'audio/mpeg','opus':'audio/ogg'}[ext]||'audio/mp4';
    res.header('Content-Type',ct);
    res.header('X-Title',encodeURIComponent(info.title));
    res.header('X-Author',encodeURIComponent(info.uploader||info.channel||''));
    const cp=spawn(BIN,[
      req.query.url,'-o','-','-f',best.format_id,
      '--no-check-certificates','--no-warnings','--prefer-free-formats'
    ]);
    let err='';
    cp.stderr.on('data',c=>err+=c);
    cp.stdout.pipe(res);
    cp.on('error',(e)=>{if(!res.headersSent)res.status(500).json({error:e.message});});
    cp.on('close',code=>{if(code&&!res.headersSent)res.status(500).json({error:`yt-dlp exited ${code}`});});
  }catch(e){if(!res.headersSent)res.status(500).json({error:e.message});}
});

app.get('/api/download-mp3',async(req,res)=>{
  try{
    const url=req.query.url;
    if(!url)return res.status(400).json({error:'Missing url'});
    const info=await ytRun([
      url,'--dump-json','--no-check-certificates','--no-warnings',
      '--prefer-free-formats','--skip-download'
    ]);
    res.header('Content-Type','audio/mpeg');
    res.header('X-Title',encodeURIComponent(info.title));
    res.header('X-Author',encodeURIComponent(info.uploader||info.channel||''));
    const cp=spawn(BIN,[
      url,'-x','--audio-format','mp3','--audio-quality','0','-o','-',
      '--no-check-certificates','--no-warnings','--prefer-free-formats'
    ]);
    let err='';
    cp.stderr.on('data',c=>err+=c);
    cp.stdout.pipe(res);
    cp.on('error',(e)=>{if(!res.headersSent)res.status(500).json({error:e.message});});
    cp.on('close',code=>{if(code&&!res.headersSent)res.status(500).json({error:`yt-dlp exited ${code}`});});
  }catch(e){if(!res.headersSent)res.status(500).json({error:e.message});}
});

app.get('/api/download-file',async(req,res)=>{
  try{
    const url=req.query.url;
    if(!url)return res.status(400).json({error:'Missing url'});
    const info=await ytRun([
      url,'--dump-json','--no-check-certificates','--no-warnings',
      '--prefer-free-formats','--skip-download'
    ]);
    const dlDir=req.query.downloadDir?path.resolve(req.query.downloadDir):YT_DOWNLOAD_DIR;
    fs.mkdirSync(dlDir,{recursive:true});
    const safeTitle=info.title.replace(/[<>:"/\\|?*]/g,'_').slice(0,100);
    const outPath=path.join(dlDir,`${safeTitle}-${Date.now()}.mp3`);
    const cp=spawn(BIN,[
      url,'-o',outPath,'-x','--audio-format','mp3','--audio-quality','0',
      '--no-check-certificates','--no-warnings','--prefer-free-formats'
    ]);
    let err='';
    cp.stderr.on('data',c=>err+=c);
    cp.on('close',code=>{
      if(code){if(!res.headersSent)res.status(500).json({error:`yt-dlp exited ${code}: ${err.slice(0,300)}`});return;}
      fs.readdir(dlDir,(_,files)=>{
        const latest=files.filter(f=>f.startsWith(safeTitle)).sort().pop();
        if(!latest)return res.status(500).json({error:'File not found after download'});
        res.json({
          filePath:path.join(dlDir,latest),
          title:info.title,
          author:info.uploader||info.channel||''
        });
      });
    });
    cp.on('error',(e)=>{if(!res.headersSent)res.status(500).json({error:e.message});});
  }catch(e){if(!res.headersSent)res.status(500).json({error:e.message});}
});

app.get('/api/stream',(req,res)=>{
  const filePath=req.query.path;
  if(!filePath||filePath.includes('..')){console.warn('/api/stream blocked:',filePath);return res.status(400).end();}
  console.log('/api/stream serving:',filePath);
  res.sendFile(filePath,err=>{if(err)console.warn('/api/stream error:',err.message);});
});

// app.listen(PORT,()=>console.log(`LumiTune server running on http://localhost:${PORT}`));
app.listen(PORT, async () => {
  const url = `http://localhost:${PORT}`;

  console.log(`LumiTune server running on ${url}`);

  // await open(url);
});
