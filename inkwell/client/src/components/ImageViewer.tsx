import { useState } from "react";
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch";

/** Zoomable manuscript. On phones it starts as a short thumbnail and expands on tap. */
export function ImageViewer({ src, alt }: { src: string; alt: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-rule bg-parchment-deep">
      <TransformWrapper minScale={1} maxScale={6} doubleClick={{ mode: "toggle", step: 2.5 }} wheel={{ step: 0.15 }}>
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            <div className="flex items-center justify-between gap-2 border-b border-rule bg-card px-2 py-1.5 text-sm">
              <button type="button" className="rounded-md px-2 py-1 lg:hidden" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
                {expanded ? "Collapse image" : "Expand image"}
              </button>
              <div className="ml-auto flex gap-1">
                <button type="button" className="rounded-md px-2.5 py-1 hover:bg-parchment-deep" onClick={() => zoomIn()} aria-label="Zoom in">+</button>
                <button type="button" className="rounded-md px-2.5 py-1 hover:bg-parchment-deep" onClick={() => zoomOut()} aria-label="Zoom out">−</button>
                <button type="button" className="rounded-md px-2 py-1 hover:bg-parchment-deep" onClick={() => resetTransform()}>Reset</button>
              </div>
            </div>
            <TransformComponent
              wrapperClass={`!w-full ${expanded ? "!h-[70vh]" : "!h-44"} lg:!h-[calc(100dvh-9rem)]`}
              contentClass="!w-full !h-full"
            >
              <img src={src} alt={alt} className="h-full w-full object-contain" draggable={false} />
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}
