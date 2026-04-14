(function(){
  try{
    var mode = localStorage.getItem('mkwt_mode') || '';
    var t = (mode === 'guest') ? 'dark' : (localStorage.getItem('mkwt_theme') || 'dark');
    document.documentElement.dataset.theme = t;
    var c = (t==='light') ? '#f3f4f6'
      : (t==='rose') ? '#f7f0f4'
      : (t==='purple' || t==='green' || t==='red' || t==='dendo') ? '#05060a'
      : '#07080a';
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', c);
  }catch(e){ /* safe to ignore */ }
})();
