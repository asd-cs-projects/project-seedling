/**
 * Capture a Recharts (SVG) chart from the DOM and convert it to a PNG data URL
 * that can be embedded in a jsPDF document via doc.addImage(...).
 *
 * Usage:
 *   <div ref={ref}><LineChart>...</LineChart></div>
 *   const png = await captureChartPng(ref.current);
 *   if (png) doc.addImage(png, 'PNG', x, y, w, h);
 */
export const captureChartPng = async (
  container: HTMLElement | null,
  scale = 2,
): Promise<string | null> => {
  if (!container) return null;
  const svg = container.querySelector('svg');
  if (!svg) return null;

  // Clone so we can inline computed styles without mutating the live DOM.
  const cloned = svg.cloneNode(true) as SVGSVGElement;

  // Recharts uses CSS variables on the page for stroke / fill. Inline them.
  const inlineStyles = (src: Element, dst: Element) => {
    const computed = window.getComputedStyle(src);
    const props = ['fill', 'stroke', 'stroke-width', 'font-family', 'font-size', 'color', 'opacity'];
    let style = '';
    props.forEach(p => {
      const v = computed.getPropertyValue(p);
      if (v) style += `${p}:${v};`;
    });
    (dst as HTMLElement).setAttribute('style', style);
    Array.from(src.children).forEach((child, idx) => {
      if (dst.children[idx]) inlineStyles(child, dst.children[idx]);
    });
  };
  inlineStyles(svg, cloned);

  const rect = svg.getBoundingClientRect();
  const width = rect.width || 600;
  const height = rect.height || 300;
  cloned.setAttribute('width', String(width));
  cloned.setAttribute('height', String(height));
  cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  const xml = new XMLSerializer().serializeToString(cloned);
  const svg64 = btoa(unescape(encodeURIComponent(xml)));
  const dataUrl = `data:image/svg+xml;base64,${svg64}`;

  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      try {
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
};
