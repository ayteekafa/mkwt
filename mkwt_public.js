(function(){
  document.addEventListener('DOMContentLoaded', function(){
    try{
      const p = (location.pathname.split('/').pop() || '').toLowerCase();
      document.querySelectorAll('.navLink').forEach(a=>{
        const href = (a.getAttribute('href') || '').toLowerCase();
        if (href && href === p) a.classList.add('active');
      });
    }catch(e){ /* safe to ignore */ }
  });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
})();
