(function($){
  function getTabFromHash(){
    var h = (window.location.hash || '').replace('#','').trim();
    if(!h) return '';
    return h.toLowerCase();
  }

  function setActiveTab($root, tab){
    var $sections = $root.find('.kbbm-portal-section');
    if(!tab){
      tab = 'main';
    }

    var ok = false;
    $sections.each(function(){
      if($(this).data('kbbm-tab') === tab){ ok = true; }
    });
    if(!ok) tab = 'main';

    $sections.hide().filter('[data-kbbm-tab="'+tab+'"]').show();
  }

  function initPortal($root){
    if(!$root || !$root.length) return;
    var initial = getTabFromHash();
    setActiveTab($root, initial || 'main');

    $(window).off('hashchange.kbbmPortal').on('hashchange.kbbmPortal', function(){
      setActiveTab($root, getTabFromHash());
    });

    // Intercept in-template nav links that point to hashes
    $root.on('click', 'a[href^="#"]', function(){
      var href = $(this).attr('href');
      if(!href) return;
      var tab = href.replace('#','').trim().toLowerCase();
      if(tab){
        window.location.hash = tab;
      }
    });
  }

  $(function(){
    initPortal($('.kbbm-portal[data-kbbm-portal="1"]'));
  });
})(jQuery);
