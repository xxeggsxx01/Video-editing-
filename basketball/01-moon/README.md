# 01 — Moon basketball: render project

The 3D reel is built in three.js and rendered frame by frame in headless Chromium. Every motion uses real kinematics (g = 1.62 m/s² on the Moon, 9.81 m/s² on Earth). Dust grains fly on clean ballistic arcs because there is no air.

- `scene.html` / `scene.js`: the scene, the timeline (synced to the voiceover), and the captions
- `render.js`: captures frames (`node render.js <out_dir> 30 <t0> <t1>`)
- `audio/vo.mp3`: ElevenLabs voiceover ("Daniel's Voice - Warm, Low, Confident", eleven_v4)
- `audio/words.json`: word timestamps (used for captions and stage timing)
- `audio/mix.wav`: voiceover plus a synthesized ambient pad. The pad cuts out for "total silence".
- `moon-basketball.mp4`: the final 1080×1920, 30 fps reel

## Rebuild

```bash
npm install
node render.js frames 30 0 68.6
ffmpeg -framerate 30 -i frames/f%05d.jpg -i audio/mix.wav -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -b:a 192k -shortest moon-basketball.mp4
```
