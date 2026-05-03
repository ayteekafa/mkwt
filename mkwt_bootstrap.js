(function(){
  try{
    var root = document.documentElement;
    var lockedTheme = (root && root.getAttribute('data-theme-lock')) || '';
    var mode = localStorage.getItem('mkwt_mode') || '';
    var t = lockedTheme || ((mode === 'guest') ? 'dendo' : (localStorage.getItem('mkwt_theme') || 'dark'));
    root.dataset.theme = t;
    var themeColors = {
      light: '#f3f4f6',
      rose: '#f7f0f4',
      glacier: '#eef6ff',
      purple: '#07060b',
      green: '#04100b',
      red: '#0f0809',
      dendo: '#05060a',
      aurora: '#04100f',
      ember: '#120b0e',
      arcade: '#090b11',
      sunset: '#140c14'
    };
    var c = themeColors[t] || '#07080a';
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', c);
  }catch(e){ /* safe to ignore */ }
})();

(function(){
  function applyChartDefaults(){
    var Chart = window.Chart;
    if(!Chart || !Chart.defaults) return;
    Chart.defaults.animation = false;
    try{
      if(Chart.defaults.transitions && Chart.defaults.transitions.active && Chart.defaults.transitions.active.animation){
        Chart.defaults.transitions.active.animation.duration = 0;
      }
    }catch(e){ /* safe to ignore */ }
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyChartDefaults, { once: true });
  else applyChartDefaults();
  window.addEventListener('load', applyChartDefaults, { once: true });
})();

(function(){
  var filterTypes = {
    chart: {
      root: '.chartFilter',
      trigger: '.chartFilterBtn',
      menu: '.chartFilterMenu'
    },
    mkcTracker: {
      root: '.mkcTrackerFilter',
      trigger: '.mkcTrackerFilterBtn',
      menu: '.mkcTrackerFilterMenu'
    }
  };
  var globalCloserBound = {};

  function resolveElement(ref){
    if(!ref) return null;
    if(typeof ref === 'string') return document.getElementById(ref);
    return ref;
  }

  function getFilterConfig(type){
    return filterTypes[type] || filterTypes.chart;
  }

  function closeFilterMenus(type, exceptRoot){
    var config = getFilterConfig(type);
    Array.prototype.slice.call(document.querySelectorAll(config.root)).forEach(function(root){
      if(exceptRoot && root === exceptRoot) return;
      var button = root.querySelector(config.trigger);
      var menu = root.querySelector(config.menu);
      if(menu) menu.hidden = true;
      if(button) button.setAttribute('aria-expanded', 'false');
    });
  }

  function toggleFilterMenu(buttonRef, menuRef, options){
    var type = (options && options.type) || 'chart';
    var config = getFilterConfig(type);
    var button = resolveElement(buttonRef);
    var menu = resolveElement(menuRef);
    if(!button || !menu) return false;
    var root = button.closest(config.root);
    var nextOpen = !!menu.hidden;
    closeFilterMenus(type, root);
    menu.hidden = !nextOpen;
    button.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    return nextOpen;
  }

  function bindGlobalFilterClosers(type){
    type = type || 'chart';
    if(globalCloserBound[type]) return;
    globalCloserBound[type] = true;
    var config = getFilterConfig(type);
    document.addEventListener('click', function(event){
      if(event.target.closest(config.root)) return;
      closeFilterMenus(type);
    });
    document.addEventListener('keydown', function(event){
      if(event.key === 'Escape') closeFilterMenus(type);
    });
  }

  function bindFilterToggle(buttonRef, menuRef, options){
    options = options || {};
    var type = options.type || 'chart';
    var button = resolveElement(buttonRef);
    var menu = resolveElement(menuRef);
    if(!button || !menu) return null;
    bindGlobalFilterClosers(type);
    button.addEventListener('click', function(event){
      event.preventDefault();
      event.stopPropagation();
      toggleFilterMenu(button, menu, { type: type });
    });
    menu.addEventListener('click', function(event){
      event.stopPropagation();
    });
    return button;
  }

  window.MKWT_UI = Object.assign({}, window.MKWT_UI || {}, {
    closeFilterMenus: closeFilterMenus,
    bindGlobalFilterClosers: bindGlobalFilterClosers,
    bindFilterToggle: bindFilterToggle,
    toggleFilterMenu: toggleFilterMenu
  });
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

    var positionFrame = 0;
    function schedulePositionMenu(){
      if(!openDropdown) return;
      if(positionFrame) return;
      var raf = window.requestAnimationFrame || function(fn){ return window.setTimeout(fn, 16); };
      positionFrame = raf(function(){
        positionFrame = 0;
        if(openDropdown) positionMenu(openDropdown);
      });
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

    window.addEventListener('resize', schedulePositionMenu);
    window.addEventListener('scroll', schedulePositionMenu, { capture: true, passive: true });
  });
})();
