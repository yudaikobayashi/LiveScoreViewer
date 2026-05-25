const PITCH_NAMES = ['C', 'D', 'D', 'E', 'E', 'F', 'G', 'G', 'A', 'A', 'B', 'B'];
const ALTERS = [0, -1, 0, -1, 0, 0, -1, 0, -1, 0, -1, 0];

const QUANTIZE_UNIT = 0.25;

const NOTE_TYPES = [
    { beats: 4, type: 'whole', dot: false },
    { beats: 3, type: 'half', dot: true },
    { beats: 2, type: 'half', dot: false },
    { beats: 1.5, type: 'quarter', dot: true },
    { beats: 1, type: 'quarter', dot: false },
    { beats: 0.75, type: 'eighth', dot: true },
    { beats: 0.5, type: 'eighth', dot: false },
    { beats: 0.375, type: '16th', dot: true },
    { beats: 0.25, type: '16th', dot: false },
    { beats: 0.125, type: '32nd', dot: false },
];

const FIFTHS_TABLE = {
    'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7,
    'F': -1, 'Bb': -2, 'Eb': -3, 'Ab': -4, 'Db': -5, 'Gb': -6, 'Cb': -7,
};

const SCALE_ROOTS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const MINOR_TO_MAJOR = {
    'A': 'C', 'E': 'G', 'B': 'D', 'F#': 'A', 'C#': 'E', 'G#': 'B', 'D#': 'F#',
    'D': 'F', 'G': 'Bb', 'C': 'Eb', 'F': 'Ab', 'Bb': 'Db', 'Eb': 'Gb', 'Ab': 'Cb',
};

let osmdInstance = null;

function midiToPitch(midi) {
    const step = PITCH_NAMES[midi % 12];
    const alter = ALTERS[midi % 12];
    const octave = Math.floor(midi / 12) - 1;
    return { step, alter, octave };
}

function quantizeDuration(duration) {
    let closest = NOTE_TYPES[0];
    let minDiff = Math.abs(duration - NOTE_TYPES[0].beats);
    for (const n of NOTE_TYPES) {
        const diff = Math.abs(duration - n.beats);
        if (diff < minDiff) {
            minDiff = diff;
            closest = n;
        }
    }
    return closest;
}

function shiftToRelativeMajor(minorRoot) {
    return MINOR_TO_MAJOR[minorRoot] || 'C';
}

function getFifths(scaleRoot, scaleName) {
    const root = SCALE_ROOTS[scaleRoot] || 'C';
    const isMinor = scaleName.toLowerCase().includes('minor');
    const majorEquivalent = isMinor ? shiftToRelativeMajor(root) : root;
    return FIFTHS_TABLE[majorEquivalent] ?? 0;
}

function detectClef(notes) {
    const avg = notes.reduce((sum, n) => sum + n.pitch, 0) / notes.length;
    return avg < 60 ? 'F' : 'G';
}

function buildMusicXml(notes, scaleRoot = 0, scaleName = 'Major', clipStart = 0) {
    const divisions = 8;
    const beatsPerMeasure = 4;
    const fifths = getFifths(scaleRoot, scaleName);
    const clefSign = detectClef(notes);
    const clefLine = clefSign === 'F' ? 4 : 2;

    const sorted = [...notes].sort((a, b) => a.startTime - b.startTime);

    const quantized = sorted.map(note => {
        const startTime = Math.round(note.startTime / QUANTIZE_UNIT) * QUANTIZE_UNIT;
        const duration = Math.max(
            Math.round(note.duration / QUANTIZE_UNIT) * QUANTIZE_UNIT,
            QUANTIZE_UNIT
        );
        return { ...note, startTime, duration };
    });

    const adjusted = quantized.map((note, i) => {
        if (i < quantized.length - 1) {
            const nextStart = quantized[i + 1].startTime;
            if (note.startTime + note.duration > nextStart) {
                return { ...note, duration: Math.max(nextStart - note.startTime, QUANTIZE_UNIT) };
            }
        }
        return note;
    });

    const events = [];
    let cursor = 0;
    for (const note of adjusted) {
        const gap = note.startTime - cursor;
        if (gap >= QUANTIZE_UNIT - 0.001) {
            events.push({ type: 'rest', beats: gap });
        }
        events.push({ type: 'note', pitch: note.pitch, beats: note.duration });
        cursor = note.startTime + note.duration;
    }

    const measures = [];
    let currentMeasure = [];
    let measureBeats = 0;

    for (const event of events) {
        let remaining = event.beats;
        let isContinuation = false;
        while (remaining > 0.001) {
            const spaceLeft = beatsPerMeasure - measureBeats;
            const take = Math.min(remaining, spaceLeft);
            const willContinue = remaining - take > 0.001;
            currentMeasure.push({
                ...event,
                beats: take,
                tieStart: event.type === 'note' && willContinue,
                tieStop: event.type === 'note' && isContinuation,
            });
            measureBeats += take;
            remaining -= take;
            if (willContinue) isContinuation = true;
            if (measureBeats >= beatsPerMeasure - 0.001) {
                measures.push(currentMeasure);
                currentMeasure = [];
                measureBeats = 0;
            }
        }
    }

    if (currentMeasure.length > 0) {
        const fillBeats = beatsPerMeasure - measureBeats;
        if (fillBeats > 0.001) {
            currentMeasure.push({ type: 'rest', beats: fillBeats });
        }
        measures.push(currentMeasure);
    }

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n';
    xml += '<score-partwise version="3.1">\n';
    xml += '  <part-list>\n';
    xml += '    <score-part id="P1"><part-name></part-name></score-part>\n';
    xml += '  </part-list>\n';
    xml += '  <part id="P1">\n';

    measures.forEach((measureEvents, i) => {
        const measureNumber = Math.floor(clipStart / beatsPerMeasure) + i + 1;
        xml += `    <measure number="${measureNumber}">\n`;
        if (i === 0) {
            xml += '      <attributes>\n';
            xml += `        <divisions>${divisions}</divisions>\n`;
            xml += `        <key><fifths>${fifths}</fifths></key>\n`;
            xml += '        <time><beats>4</beats><beat-type>4</beat-type></time>\n';
            xml += `        <clef><sign>${clefSign}</sign><line>${clefLine}</line></clef>\n`;
            xml += '      </attributes>\n';
        }

        for (const event of measureEvents) {
            const q = quantizeDuration(event.beats);
            const xmlDuration = Math.round(q.beats * divisions);

            if (event.type === 'rest') {
                xml += '      <note>\n';
                xml += '        <rest/>\n';
                xml += `        <duration>${xmlDuration}</duration>\n`;
                xml += `        <type>${q.type}</type>\n`;
                if (q.dot) xml += '        <dot/>\n';
                xml += '      </note>\n';
            } else {
                const pitch = midiToPitch(event.pitch);
                xml += '      <note>\n';
                xml += '        <pitch>\n';
                xml += `          <step>${pitch.step}</step>\n`;
                if (pitch.alter !== 0) {
                    xml += `          <alter>${pitch.alter}</alter>\n`;
                }
                xml += `          <octave>${pitch.octave}</octave>\n`;
                xml += '        </pitch>\n';
                xml += `        <duration>${xmlDuration}</duration>\n`;
                if (event.tieStop) xml += '        <tie type="stop"/>\n';
                if (event.tieStart) xml += '        <tie type="start"/>\n';
                xml += `        <type>${q.type}</type>\n`;
                if (q.dot) xml += '        <dot/>\n';
                if (event.tieStop || event.tieStart) {
                    xml += '        <notations>\n';
                    if (event.tieStop) xml += '          <tied type="stop"/>\n';
                    if (event.tieStart) xml += '          <tied type="start"/>\n';
                    xml += '        </notations>\n';
                }
                xml += '      </note>\n';
            }
        }

        xml += '    </measure>\n';
    });

    xml += '  </part>\n';
    xml += '</score-partwise>\n';

    return xml;
}

async function updateScore(notesJson) {
    try {
        const data = JSON.parse(notesJson);
        const xml = buildMusicXml(data.notes, data.scaleRoot, data.scaleName, data.clipStart);
        if (!osmdInstance) {
            osmdInstance = new opensheetmusicdisplay.OpenSheetMusicDisplay('output', {
                drawTitle: false,
                drawPartNames: false,
                autoBeam: true,
            });
        }
        await osmdInstance.load(xml);
        osmdInstance.render();
    } catch (e) {
        console.error('Error:', e);
    }
}
