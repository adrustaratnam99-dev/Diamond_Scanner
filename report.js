const sheet = document.querySelector('#sheet');
let report;
try { report = JSON.parse(sessionStorage.getItem('diamond-report-preview')); } catch {}
if (!report?.completedAt || !Array.isArray(report.findings)) {
  sheet.hidden = true;
  document.querySelector('#error').hidden = false;
  document.querySelector('#print').disabled = true;
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
}
