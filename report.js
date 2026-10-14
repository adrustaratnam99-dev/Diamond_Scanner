const sheet = document.querySelector('#sheet');
document.querySelector('#reportHome').addEventListener('click', () => {
  if (window.parent !== window) window.parent.postMessage({ type: 'scanner-home' }, window.location.origin);
  else window.location.replace('./');
});
let report;
try { report = JSON.parse(sessionStorage.getItem('diamond-report-preview')); } catch {}
if (!report?.completedAt || !Array.isArray(report.findings)) {
  sheet.hidden = true;
  document.querySelector('#error').hidden = false;
  document.querySelector('#print').disabled = true;
  document.querySelector('#downloadPdf').disabled = true;
  document.querySelector('#shareWhatsapp').disabled = true;
} else {
  const completed = new Date(report.completedAt);
  const put = (id, value) => { document.getElementById(id).textContent = value; };
  put('date', completed.toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' }));
  put('time', completed.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }));
  put('grade', report.grade);
  put('result', report.result);
  report.findings.forEach((finding) => { const li = document.createElement('li'); li.textContent = finding; document.querySelector('#findings').append(li); });
  const colors = { good: '#237b24', bad: '#d62030', neutral: '#36433f', undetected: '#3480a8' };
  sheet.style.setProperty('--accent', colors[report.tone] || colors.neutral);
  if (report.tone === 'neutral') document.querySelector('#bars').style.background = 'linear-gradient(to right, #36ed00 46%, transparent 46% 54%, #ff1424 54%)';
  if (report.photo) document.querySelector('#photo').src = report.photo;
  else { document.querySelector('#photo').hidden = true; put('photoCaption', 'NO SAMPLE PHOTO CAPTURED'); }
  document.querySelector('#print').addEventListener('click', () => window.print());
  async function generatePdf() {
    try {
      const pdf = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', compress: true });
      const logo = document.querySelector('header img');
      await logo.decode();
      const addContainedImage = (image, x, y, width, height) => {
        const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
        const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
        pdf.addImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h, undefined, 'FAST');
      };
      addContainedImage(logo, 16, 12, 62, 52);
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
      pdf.text(`DATE: ${document.querySelector('#date').textContent}`, 116, 30);
      pdf.text(`TIME: ${completed.toLocaleTimeString()}`, 116, 39);
      pdf.setFillColor('#1b2224'); pdf.rect(14, 70, 182, 16, 'F');
      pdf.setTextColor('#ffffff'); pdf.setFontSize(20); pdf.text('ANALYSIS REPORT', 105, 81, { align: 'center' });
      pdf.setTextColor('#172024'); pdf.setFontSize(13); pdf.text('ANALYSIS DETAILS', 18, 101);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11);
      report.findings.forEach((finding, index) => {
        const y = 117 + index * 23;
        pdf.text(pdf.splitTextToSize(`${index + 1}. ${finding}`, 101), 18, y);
        pdf.setDrawColor('#c9d1d0'); pdf.line(18, y + 13, 119, y + 13);
      });
      const accent = colors[report.tone] || colors.neutral;
      pdf.setTextColor(accent); pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13);
      pdf.text(report.grade, 158, 102, { align: 'center' });
      pdf.setFillColor(accent); pdf.rect(153, 110, 10, 22, 'F');
      if (report.tone === 'neutral') {
        pdf.setFillColor('#36ed00'); pdf.rect(153, 110, 4.5, 22, 'F');
        pdf.setFillColor('#ffffff'); pdf.rect(157.5, 110, 1, 22, 'F');
        pdf.setFillColor('#ff1424'); pdf.rect(158.5, 110, 4.5, 22, 'F');
      }
      pdf.setDrawColor('#abb9b5'); pdf.rect(128, 141, 60, 58);
      if (report.photo) { const photo = document.querySelector('#photo'); await photo.decode(); addContainedImage(photo, 130, 143, 56, 50); }
      pdf.setTextColor('#56635f'); pdf.setFontSize(8); pdf.text(report.photo ? 'SAMPLE PHOTO' : 'NO SAMPLE PHOTO CAPTURED', 158, 196, { align: 'center' });
      pdf.setDrawColor(accent); pdf.rect(14, 215, 182, 24);
      pdf.setTextColor(accent); pdf.setFontSize(9); pdf.text('FINAL RESULT', 18, 212);
      pdf.setFontSize(18); pdf.text(report.result, 105, 230, { align: 'center', maxWidth: 172 });
      pdf.setTextColor('#172024'); pdf.setFontSize(9); pdf.text('AUTHORIZED SIGNATORY', 18, 258);
      pdf.setDrawColor('#6b7672'); pdf.line(18, 275, 91, 275);
      return pdf.output('blob');
    } catch { return null; }
  }
  const downloadPdf = document.querySelector('#downloadPdf');
  const shareWhatsapp = document.querySelector('#shareWhatsapp');
  downloadPdf.addEventListener('click', async () => {
    downloadPdf.disabled = true;
    const blob = await generatePdf();
    if (blob) {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = `${report.result.replaceAll(' ', '-')}.pdf`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } else downloadPdf.textContent = 'Retry PDF download';
    downloadPdf.disabled = false;
  });
  shareWhatsapp.addEventListener('click', async () => {
    shareWhatsapp.disabled = true;
    const blob = await generatePdf();
    const file = blob && new File([blob], `${report.result.replaceAll(' ', '-')}.pdf`, { type: 'application/pdf' });
    if (file && navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
      try { await navigator.share({ files: [file], title: report.result, text: 'Diamond analysis report' }); }
      catch (error) { if (error.name !== 'AbortError') shareWhatsapp.textContent = 'Share unavailable'; }
    } else shareWhatsapp.textContent = 'Use Download PDF';
    shareWhatsapp.disabled = false;
  });
}
