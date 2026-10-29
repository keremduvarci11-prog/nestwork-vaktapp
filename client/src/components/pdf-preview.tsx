import { useEffect, useRef, useState } from "react";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
import { Button } from "@/components/ui/button";

GlobalWorkerOptions.workerSrc = workerUrl;

// Android WebView has no built-in PDF viewer. Render locally rather than
// navigating to a blob URL or sending confidential payroll files to a service.
export function PdfPreview({ url }: { url: string }) {
  const container = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [width, setWidth] = useState(300);
  const [pages, setPages] = useState(0);
  const [page, setPage] = useState(1);
  useEffect(() => {
    let active = true;
    setPdf(null);
    setError(false);
    setLoading(true);
    setPages(0);
    setPage(1);
    const task = getDocument(url);
    void task.promise.then(document => {
      if (!active) return;
      setPdf(document);
      setPages(document.numPages);
    }).catch(error => {
      if (active) {
        console.error("[PDF] Rendering failed:", error);
        setError(true); setLoading(false);
      }
    });
    return () => { active = false; void task.destroy(); };
  }, [url]);
  useEffect(() => {
    if (!pdf || !canvas.current) return;
    let active = true;
    let render: ReturnType<Awaited<ReturnType<PDFDocumentProxy["getPage"]>>["render"]> | undefined;
    const element = canvas.current;
    setLoading(true);
    setError(false);
    void pdf.getPage(page).then(async pdfPage => {
      if (!active) return;
      const scale = width / pdfPage.getViewport({ scale: 1 }).width;
      const viewport = pdfPage.getViewport({ scale });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      element.width = Math.floor(viewport.width * ratio);
      element.height = Math.floor(viewport.height * ratio);
      element.style.width = `${viewport.width}px`;
      element.style.height = `${viewport.height}px`;
      render = pdfPage.render({
        canvas: element,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      await render.promise;
      if (active) setLoading(false);
    }).catch(() => {
      if (active) { setError(true); setLoading(false); }
    });
    return () => { active = false; render?.cancel(); };
  }, [pdf, page, width]);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(100, Math.floor(entry.contentRect.width) - 16));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={container} className="flex-1 min-h-0 overflow-auto bg-muted p-2" data-testid="pdf-preview">
      {loading && <p role="status">Åpner lønnsslippen …</p>}
      {error && <p role="alert">Kunne ikke vise PDF-en. Prøv å åpne den igjen, eller bruk «Last ned / del PDF».</p>}
      <canvas ref={canvas} role="img" aria-label={`Lønnsslipp, side ${page}`} className={loading || error ? "hidden" : "mx-auto"} />
      {pages > 1 && (
        <div className="flex justify-center items-center gap-3 py-3">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Forrige</Button>
          <span aria-live="polite">Side {page} av {pages}</span>
          <Button variant="outline" disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Neste</Button>
        </div>
      )}
    </div>
  );
}
