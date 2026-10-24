(() => {
  const menu = document.getElementById('menu-toggle');
  const nav = document.getElementById('site-nav');
  if (menu && nav) menu.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Close navigation' : 'Open navigation');
    menu.textContent = open ? '×' : '☰';
  });
  nav?.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
    nav.classList.remove('open'); menu?.setAttribute('aria-expanded', 'false');
    if (menu) { menu.textContent = '☰'; menu.setAttribute('aria-label', 'Open navigation'); }
  }));
  document.getElementById('footer-year').textContent = new Date().getFullYear();
  const reveal = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
    }), { threshold: .12 });
    reveal.forEach(el => observer.observe(el));
  } else reveal.forEach(el => el.classList.add('visible'));
  const pathways = {
    secondary: {
      title: 'Start with the way you study.',
      description: 'Keep secondary-school subjects and assessment results organised without relying on memory or scattered notes.',
      points: ['Set up subjects and the tests or exams you use.', 'Enter marks as teachers return results.', 'Review missing scores, totals, and targets.']
    },
    university: {
      title: 'Keep courses and results connected.',
      description: 'Organise course assessments and review your academic performance, including GPA/CGPA where supported by your course data.',
      points: ['Organise courses and configure continuous assessment and exams.', 'Record results and maximum marks as they arrive.', 'Review course summaries and GPA/CGPA information.']
    },
    routine: {
      title: 'Make your next study session intentional.',
      description: 'Use the results you have—not vague feelings—to choose what to practise, while keeping personal records backed up.',
      points: ['Check which marks or assessments are still missing.', 'Compare results with your own targets.', 'Choose a subject to revisit and export backups regularly.']
    }
  };
  const pathwayTitle = document.getElementById('pathway-title');
  const pathwayDescription = document.getElementById('pathway-description');
  const pathwayPoints = document.getElementById('pathway-points');
  document.querySelectorAll('[data-pathway]').forEach(button => button.addEventListener('click', () => {
    const pathway = pathways[button.dataset.pathway];
    if (!pathway || !pathwayTitle || !pathwayDescription || !pathwayPoints) return;
    document.querySelectorAll('[data-pathway]').forEach(tab => {
      const active = tab === button;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-pressed', String(active));
    });
    pathwayTitle.textContent = pathway.title;
    pathwayDescription.textContent = pathway.description;
    pathwayPoints.replaceChildren(...pathway.points.map(point => {
      const item = document.createElement('li');
      item.textContent = point;
      return item;
    }));
  }));
  document.querySelectorAll('.faq-item').forEach(item => item.addEventListener('toggle', () => {
    if (item.open) document.querySelectorAll('.faq-item').forEach(other => { if (other !== item) other.open = false; });
  }));
})();