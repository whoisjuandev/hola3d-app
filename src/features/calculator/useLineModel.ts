// The state behind "Cargar modelo 3D" in a calculator line, and dropping a file on the line.
import { useEffect, useRef, useState, type DragEvent } from 'react';
import type { Spool } from '../../../shared/spools';
import type { LineDraft } from './draft';
import { ModelError } from './model/error';
import { followEdit, loadModel, modelFromReading, parseInfill, parseRate, retune, type LineModel } from './model/line';
import { modelSizeProblem, readModelFile } from './model/read';

const INFILL_KEY = 'hola3d.calculadora.relleno';
const RATE_KEY = 'hola3d.calculadora.gramosPorHora';
const DEFAULT_INFILL = '15';
const DEFAULT_RATE = '25';

/** The last valid infill or rate the owner typed, or the default. */
function remembered(key: string, fallback: string, valid: (text: string) => number | null): string {
  try {
    const text = localStorage.getItem(key);
    return text !== null && valid(text) !== null ? text : fallback;
  } catch {
    return fallback;
  }
}

function remember(key: string, text: string) {
  try {
    localStorage.setItem(key, text);
  } catch {
    // Private mode or storage full: the default is used next time.
  }
}

const isModelName = (name: string) => /\.(stl|3mf)$/i.test(name);

export type ModelTune = Partial<Pick<LineModel, 'infill' | 'rate'>>;

/**
 * The model state of one line. `change` replaces the line's own onChange: it lets go of the model when the owner types
 * grams or time, and estimates again when the first filament's material changes. A line without a model is untouched.
 */
export function useLineModel(line: LineDraft, spools: Spool[], onChange: (l: LineDraft) => void) {
  const [model, setModel] = useState<LineModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The line as it is when a file finishes reading, which may be after the owner typed something more.
  const latest = useRef({ line, spools, onChange });
  useEffect(() => {
    latest.current = { line, spools, onChange };
  });
  const reading = useRef(0);

  const change = (next: LineDraft) => {
    const followed = followEdit(line, next, model, spools);
    if (followed.model !== model) setModel(followed.model);
    onChange(followed.line);
  };

  /** Reads the file; a file that cannot be read shows its message and changes nothing in the line. */
  const readFile = async (file: File) => {
    const ticket = ++reading.current;
    const problem = !isModelName(file.name) ? 'Elegí un archivo .stl o .3mf.' : modelSizeProblem(file.size);
    if (problem) {
      setError(problem);
      setBusy(false);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const result = await readModelFile(file.name, new Uint8Array(await file.arrayBuffer()));
      if (ticket !== reading.current) return;
      const loaded = modelFromReading(file.name, result, {
        infill: remembered(INFILL_KEY, DEFAULT_INFILL, parseInfill), rate: remembered(RATE_KEY, DEFAULT_RATE, parseRate),
      });
      const now = latest.current;
      setModel(loaded);
      now.onChange(loadModel(now.line, loaded, now.spools));
    } catch (e) {
      if (ticket !== reading.current) return;
      setError(e instanceof ModelError ? e.message : 'No se pudo leer el archivo. Probá con otro STL o 3MF.');
    } finally {
      if (ticket === reading.current) setBusy(false);
    }
  };

  /** A new infill or rate: remembered when valid, and the line estimated again with it. */
  const tune = (patch: ModelTune) => {
    if (!model) return;
    const next = { ...model, ...patch };
    if (patch.infill !== undefined && parseInfill(patch.infill) !== null) remember(INFILL_KEY, patch.infill);
    if (patch.rate !== undefined && parseRate(patch.rate) !== null) remember(RATE_KEY, patch.rate);
    setModel(next);
    const retuned = retune(line, next, spools);
    if (retuned !== line) onChange(retuned);
  };

  return { model, error, busy, change, readFile, tune };
}

/** Drop a file anywhere on the line: the handlers for its <article>, and whether a file is over it. */
export function useFileDrop(onFile: (file: File) => void) {
  const [over, setOver] = useState(false);
  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  return {
    over,
    handlers: {
      onDragOver: (e: DragEvent<HTMLElement>) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        setOver(true);
      },
      onDragLeave: (e: DragEvent<HTMLElement>) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (e: DragEvent<HTMLElement>) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        setOver(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      },
    },
  };
}
