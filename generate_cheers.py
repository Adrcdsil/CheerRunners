"""
Generate 4 high-fidelity neural WAV audio files for CheerSquad cheering.
"""
import os
import asyncio
import wave
import edge_tts
import miniaudio

CHEERS = [
    {
        "filename": "go_hard.wav",
        "text": "Go hard or go Home!",
        "voice": "en-US-GuyNeural",
        "rate": "+12%",
        "pitch": "+3Hz"
    },
    {
        "filename": "you_got_this.wav",
        "text": "You've got this!",
        "voice": "en-US-AriaNeural",
        "rate": "+8%",
        "pitch": "+2Hz"
    },
    {
        "filename": "go_go_go.wav",
        "text": "Go! Go! Go!",
        "voice": "en-US-GuyNeural",
        "rate": "+20%",
        "pitch": "+4Hz"
    },
    {
        "filename": "vamo_porra.wav",
        "text": "Vamo, porra!",
        "voice": "pt-BR-AntonioNeural",
        "rate": "+15%",
        "pitch": "+3Hz"
    }
]

OUTPUT_DIR = os.path.join("public", "audio", "cheers")

async def generate_cheer(cheer):
    out_path = os.path.join(OUTPUT_DIR, cheer["filename"])
    print(f"Generating '{cheer['filename']}' with voice {cheer['voice']}...")
    
    comm = edge_tts.Communicate(
        text=cheer["text"],
        voice=cheer["voice"],
        rate=cheer["rate"],
        pitch=cheer["pitch"]
    )
    
    chunks = []
    async for chunk in comm.stream():
        if chunk["type"] == "audio":
            chunks.append(chunk["data"])
            
    raw_mp3 = b"".join(chunks)
    if not raw_mp3:
        raise RuntimeError(f"No audio received for {cheer['filename']}")
        
    decoded = miniaudio.decode(
        raw_mp3,
        nchannels=1,
        sample_rate=44100,
        output_format=miniaudio.SampleFormat.SIGNED16
    )
    
    with wave.open(out_path, "wb") as wf:
        wf.setnchannels(decoded.nchannels)
        wf.setsampwidth(2) # 16-bit
        wf.setframerate(decoded.sample_rate) # 44.1kHz
        wf.writeframes(decoded.samples.tobytes())
        
    size_bytes = os.path.getsize(out_path)
    duration_sec = decoded.num_frames / decoded.sample_rate
    print(f" -> Successfully saved: {out_path}")
    print(f"    Size: {size_bytes} bytes | Duration: {duration_sec:.2f}s | Format: PCM 16-bit 44.1kHz Mono")
    return {
        "filename": cheer["filename"],
        "path": out_path,
        "size_bytes": size_bytes,
        "duration_sec": round(duration_sec, 2),
        "text": cheer["text"],
        "voice": cheer["voice"]
    }

async def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    results = []
    for cheer in CHEERS:
        res = await generate_cheer(cheer)
        results.append(res)
    print("\nAll 4 cheer audios generated successfully!")
    return results

if __name__ == "__main__":
    asyncio.run(main())
