"use client";

import { useRef, useState } from "react";

export default function DrawingPad() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);

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
  }

  function finish() {
    setDrawing(false);
  }

  function clear() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    setDrawing(false);
  }

  return (
    <div className="drawing-pad">
      <div className="drawing-pad-head">
        <span>Drawing area · stays in this browser</span>
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
      <p>Use a stylus, mouse or touch. The sketch is not uploaded or included in the report.</p>
    </div>
  );
}
