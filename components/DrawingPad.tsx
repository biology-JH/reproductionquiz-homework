"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  storageKey: string;
  resetSignal: number;
}

export default function DrawingPad({ storageKey, resetSignal }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const saveTimer = useRef<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);

  useEffect(() => {
    let active = true;
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const savedImage = window.localStorage.getItem(storageKey);
      if (savedImage) {
        const image = new window.Image();
        image.onload = () => {
          if (!active) return;
          const context = canvas.getContext("2d");
          if (context) context.drawImage(image, 0, 0, canvas.width, canvas.height);
        };
        image.onerror = () => setStorageWarning(true);
        image.src = savedImage;
      }
    } catch {
      setStorageWarning(true);
    }
    return () => {
      active = false;
      if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
    };
  }, [storageKey]);

  useEffect(() => {
    if (resetSignal === 0) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    setDrawing(false);
    try {
      window.localStorage.removeItem(storageKey);
      setStorageWarning(false);
    } catch {
      setStorageWarning(true);
    }
  }, [resetSignal, storageKey]);

  function saveNow() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      window.localStorage.setItem(storageKey, canvas.toDataURL("image/png"));
      setStorageWarning(false);
    } catch {
      setStorageWarning(true);
    }
  }

  function scheduleSave() {
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      saveNow();
    }, 300);
  }

  function point(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function begin(event: React.PointerEvent<HTMLCanvasElement>) {
    event.preventDefault();
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    canvas.setPointerCapture(event.pointerId);
    const p = point(event);
    context.beginPath();
    context.moveTo(p.x, p.y);
    context.strokeStyle = "#214e34";
    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.lineJoin = "round";
    setDrawing(true);
  }

  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing) return;
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;
    const p = point(event);
    context.lineTo(p.x, p.y);
    context.stroke();
    scheduleSave();
  }

  function finish() {
    setDrawing(false);
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    saveNow();
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setDrawing(false);
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    try {
      window.localStorage.removeItem(storageKey);
      setStorageWarning(false);
    } catch {
      setStorageWarning(true);
    }
  }

  return (
    <div className="drawing-pad">
      <div className="drawing-pad-head">
        <span>Drawing area · saved only in this browser</span>
        <button type="button" className="quiet-button" onClick={clear}>Clear drawing</button>
      </div>
      <canvas
        ref={canvasRef}
        width={840}
        height={340}
        aria-label="Freehand drawing area for a labelled carpel and stamen"
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
      />
      <p>Use a stylus, mouse or touch. The sketch is never uploaded or sent for marking.</p>
      {storageWarning && <p role="alert">This browser could not save or restore the sketch. Keep this page open to avoid losing it.</p>}
    </div>
  );
}
