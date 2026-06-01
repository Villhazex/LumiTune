const fs = require("fs");
const path = "D:/Coding/project/LumiTune/js/player/player.js";

// Read the file as bytes to detect exact line endings
const buf = fs.readFileSync(path);
const hasCRLF = buf.includes(Buffer.from("\r\n"));
const NL = hasCRLF ? "\r\n" : "\n";

console.log("Original file size:", buf.length);
console.log("Line endings:", hasCRLF ? "CRLF" : "LF");

let code = buf.toString("utf8");

// ---- Edit 1: fix metadata update on duration ----
// OLD: const extra=activeRow.querySelector('.t-extra');if(extra)extra.textContent
// NEW: const durEl=activeRow.querySelector('.t-dur');if(durEl)durEl.textContent
const old1 = "const extra=activeRow.querySelector('.t-extra');if(extra)extra.textContent";
const new1 = "const durEl=activeRow.querySelector('.t-dur');if(durEl)durEl.textContent";
if (code.includes(old1)) {
  code = code.replace(old1, new1);
  console.log("Edit 1: OK");
} else {
  console.log("Edit 1: SKIP (already applied or not found)");
}

// ---- Edit 2: add visibilitychange handler ----
const marker = "  },100);" + NL + "}" + NL + "function stopPlayback(){";
if (code.includes(marker)) {
  const bt = "`";
  const handler =
    "  },100);" + NL +
    "}" + NL +
    "document.addEventListener('visibilitychange',()=>{" + NL +
    "  if(document.hidden){" + NL +
    "    if(playbackInterval){clearInterval(playbackInterval);playbackInterval=null;}" + NL +
    "    if(loudnessInterval){clearInterval(loudnessInterval);loudnessInterval=null;}" + NL +
    "  }else{" + NL +
    "    if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume();" + NL +
    "    if(isPlaying&&!audioPlayer.src&&!playbackInterval&&totalDuration>0){" + NL +
    "      playbackInterval=setInterval(()=>{" + NL +
    "        if(isPlaying){currentPlaybackTime+=0.1;totalPlayTime+=0.1;sessionPlayTime+=0.1;updateLyricHighlight(currentPlaybackTime);if(currentPlaybackTime>=totalDuration){$('currentTime').textContent=fmt(totalDuration);$('progressFill').style.width='100%';const kct=$('karaokeCurrentTime');if(kct)kct.textContent=fmt(totalDuration);const kpf=$('karaokeProgressFill');if(kpf)kpf.style.width='100%';updateHeroProgress();handleEnd();return;}" + NL +
    "        $('currentTime').textContent=fmt(currentPlaybackTime);$('progressFill').style.width=" + bt + "${(currentPlaybackTime/totalDuration)*100}%" + bt + ";const kct=$('karaokeCurrentTime');if(kct)kct.textContent=fmt(currentPlaybackTime);const kpf=$('karaokeProgressFill');if(kpf)kpf.style.width=" + bt + "${(currentPlaybackTime/totalDuration)*100}%" + bt + ";updateHeroProgress();" + NL +
    "      },100);" + NL +
    "    }" + NL +
    "  }" + NL +
    "});" + NL + NL +
    "function stopPlayback(){";
  code = code.replace(marker, handler);
  console.log("Edit 2: OK");
} else {
  console.log("Edit 2: FAIL - marker not found");
  process.exit(1);
}

// ---- Edit 3: remove emoji from volume popup ----
const old3 = "popup.textContent=isMuted?'\uD83D\uDD07 0%':'\uD83D\uDD0A '+Math.round(volume*100)+'%';";
const new3 = "popup.textContent=isMuted?'0%':Math.round(volume*100)+'%';";
if (code.includes(old3)) {
  code = code.replace(old3, new3);
  console.log("Edit 3: OK");
} else {
  console.log("Edit 3: SKIP (already applied or not found)");
  // Check if it's already applied
  if (code.includes("popup.textContent=isMuted?'0%':Math.round")) {
    console.log("  (already looks applied)");
  }
}

// ---- Validate syntax ----
const vm = require("vm");
try {
  vm.compileFunction(code, []);
  console.log("SYNTAX: OK");
} catch(e) {
  console.log("SYNTAX ERROR:", e.message);
  // Write to temp file for inspection
  const tmpPath = require("os").tmpdir() + "/player_failed.js";
  fs.writeFileSync(tmpPath, code, "utf8");
  console.log("Saved failed output to:", tmpPath);
  process.exit(1);
}

// ---- Write the file ----
fs.writeFileSync(path, code, "utf8");
console.log("Written:", fs.readFileSync(path).length, "bytes");
