(function(){
  document.addEventListener('DOMContentLoaded', function(){
    try{
      let rawPage = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
      if (rawPage && !rawPage.includes('.')) rawPage = rawPage === 'index' ? 'index.html' : `${rawPage}.html`;
      const p = rawPage === 'mkcentral.html' ? 'lounge-stats.html' : rawPage;

      document.querySelectorAll('.navDropdownItem').forEach(item => {
        const href = (item.getAttribute('href') || '').toLowerCase();
        item.classList.toggle('active', !!href && href === p);
      });

      document.querySelectorAll('.navDropdown').forEach(dropdown => {
        const trigger = dropdown.querySelector('.navDropTrigger');
        if (trigger) trigger.classList.toggle('active', !!dropdown.querySelector('.navDropdownItem.active'));
      });

      document.querySelectorAll('.navLink[href]').forEach(a => {
        const href = (a.getAttribute('href') || '').toLowerCase();
        a.classList.toggle('active', !!href && href === p);
      });
    }catch(e){ /* safe to ignore */ }
  });

  if ('serviceWorker' in navigator) {
    const isLocalDev = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
    window.addEventListener('load', () => {
      if(isLocalDev){
        navigator.serviceWorker.getRegistrations()
          .then(registrations => Promise.all(registrations.map(registration => registration.unregister())))
          .catch(() => {});
        if(window.caches){
          caches.keys()
            .then(keys => Promise.all(keys.filter(key => key.indexOf('mkwt-') === 0).map(key => caches.delete(key))))
            .catch(() => {});
        }
        return;
      }
      navigator.serviceWorker.register('/sw.js?v=577', { updateViaCache: 'none' }).catch(() => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
      });
    });
  }
})();
