const express=require('express');
const {spawn,execFile}=require('child_process');
const path=require('path');
const app=express();
const PORT=3001;
const BIN=path.join(require.resolve('yt-dlp-exec/package.json'),'..','bin','yt-dlp.exe');

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
      '--prefer-free-formats','--skip-download'
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

app.listen(PORT,()=>console.log(`LumiTune server running on http://localhost:${PORT}`));
