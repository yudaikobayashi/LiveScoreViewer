function bang() {
    let song = new LiveAPI("live_set");
    const scaleRoot = song.get("root_note")[0];
    const scaleName = song.get("scale_name")[0];

    let clip = new LiveAPI("live_set view detail_clip");
    const clipStart = clip.get("start_time")[0];

    let raw = clip.call(
        "get_notes_extended",
        0,
        128,
        0.0,
        9999.0
    );

    let data = JSON.parse(raw);

    let notes = data.notes.map(note => ({
        pitch: note.pitch,
        startTime: note.start_time,
        duration: note.duration
    }));

    outlet(0, JSON.stringify({ notes, scaleRoot, scaleName, clipStart }));
}
