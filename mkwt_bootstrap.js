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

(function(){
  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function(){
    var dropdowns = Array.prototype.slice.call(document.querySelectorAll('.navDropdown'));
    if(!dropdowns.length) return;

    var openDropdown = null;

    function getParts(dropdown){
      return {
        trigger: dropdown.querySelector('.navDropTrigger'),
        menu: dropdown.querySelector('.navDropdownMenu')
      };
    }

    function setExpanded(dropdown, expanded){
      var parts = getParts(dropdown);
      dropdown.classList.toggle('is-open', expanded);
      if(parts.trigger) parts.trigger.setAttribute('aria-expanded', expanded ? 'true' : 'false');
    }

    function closeDropdown(dropdown){
      if(!dropdown) return;
      setExpanded(dropdown, false);
      if(openDropdown === dropdown) openDropdown = null;
    }

    function closeAll(except){
      dropdowns.forEach(function(dropdown){
        if(dropdown !== except) closeDropdown(dropdown);
      });
    }

    function positionMenu(dropdown){
      var parts = getParts(dropdown);
      if(!parts.trigger || !parts.menu) return;
      var rect = parts.trigger.getBoundingClientRect();
      var menu = parts.menu;
      var minWidth = Math.max(190, Math.round(rect.width));
      menu.style.minWidth = minWidth + 'px';
      var menuWidth = Math.max(minWidth, menu.offsetWidth || minWidth);
      var left = Math.round(rect.left);
      var maxLeft = Math.max(8, window.innerWidth - menuWidth - 8);
      if(left > maxLeft) left = maxLeft;
      if(left < 8) left = 8;
      menu.style.left = left + 'px';
      menu.style.top = Math.round(rect.bottom + 8) + 'px';
    }

    function open(dropdown){
      closeAll(dropdown);
      setExpanded(dropdown, true);
      openDropdown = dropdown;
      positionMenu(dropdown);
    }

    function toggle(dropdown){
      if(dropdown.classList.contains('is-open')) closeDropdown(dropdown);
      else open(dropdown);
    }

    dropdowns.forEach(function(dropdown){
      var parts = getParts(dropdown);
      if(!parts.trigger || !parts.menu) return;

      parts.trigger.addEventListener('click', function(event){
        event.preventDefault();
        event.stopPropagation();
        toggle(dropdown);
      });

      parts.trigger.addEventListener('keydown', function(event){
        if(event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown'){
          event.preventDefault();
          open(dropdown);
          var first = parts.menu.querySelector('a');
          if(first) first.focus();
        }else if(event.key === 'Escape'){
          closeDropdown(dropdown);
          parts.trigger.focus();
        }
      });

      parts.menu.addEventListener('click', function(event){
        event.stopPropagation();
      });

      parts.menu.addEventListener('keydown', function(event){
        var items = Array.prototype.slice.call(parts.menu.querySelectorAll('a'));
        var current = document.activeElement;
        var idx = items.indexOf(current);
        if(event.key === 'Escape'){
          event.preventDefault();
          closeDropdown(dropdown);
          parts.trigger.focus();
        }else if(event.key === 'ArrowDown'){
          event.preventDefault();
          (items[idx + 1] || items[0] || parts.trigger).focus();
        }else if(event.key === 'ArrowUp'){
          event.preventDefault();
          (items[idx - 1] || items[items.length - 1] || parts.trigger).focus();
        }
      });
    });

    document.addEventListener('click', function(event){
      if(openDropdown && !openDropdown.contains(event.target)) closeDropdown(openDropdown);
    });

    window.addEventListener('resize', function(){
      if(openDropdown) positionMenu(openDropdown);
    });

    window.addEventListener('scroll', function(){
      if(openDropdown) positionMenu(openDropdown);
    }, true);
  });
})();
