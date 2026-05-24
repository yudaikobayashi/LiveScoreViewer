function bang() {

    let clip = new LiveAPI("live_set view detail_clip");

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

    outlet(0, JSON.stringify(notes));
}
