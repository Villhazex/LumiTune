const fs=require('fs');
const path=require('path');
function cp(src,dst){
  if(!fs.existsSync(src))return;
  const s=fs.lstatSync(src);
  if(s.isDirectory()){
    fs.mkdirSync(dst,{recursive:true});
    for(const e of fs.readdirSync(src))cp(path.join(src,e),path.join(dst,e));
  }else{
    fs.mkdirSync(path.dirname(dst),{recursive:true});
    fs.copyFileSync(src,dst);
  }
}
fs.rmSync('dist',{recursive:true,force:true});
fs.mkdirSync('dist');
for(const f of ['index.html','style.css','favicon.ico','js','themes','gege.html','example.html'])cp(f,path.join('dist',f));
// copy yt-dlp.exe and fpcalc.exe to src-tauri/resources/
const ytSrc='node_modules/yt-dlp-exec/bin/yt-dlp.exe';
if(fs.existsSync(ytSrc)){
  fs.mkdirSync('src-tauri/resources',{recursive:true});
  fs.copyFileSync(ytSrc,'src-tauri/resources/yt-dlp.exe');
}
// fpcalc.exe must be manually placed in src-tauri/resources/
// Download from: https://github.com/acoustid/chromaprint/releases
