(function(){
  'use strict';
  var root=document.documentElement;
  var themeButton=document.querySelector('.theme-toggle');
  function setTheme(mode){root.classList.toggle('dark',mode==='dark');try{localStorage.setItem('portfolio-theme',mode)}catch(e){}}
  if(themeButton){themeButton.addEventListener('click',function(){setTheme(root.classList.contains('dark')?'light':'dark')});}

  window.requestAnimationFrame(function(){document.body.classList.add('js-ready');});

  var header=document.querySelector('.site-header');
  function syncHeader(){ if(!header) return; header.classList.toggle('scrolled', window.scrollY > 10); }
  syncHeader();
  window.addEventListener('scroll', syncHeader, {passive:true});

  var revealNodes=document.querySelectorAll('.reveal');
  if('IntersectionObserver' in window && revealNodes.length){
    revealNodes.forEach(function(node, index){node.style.setProperty('--reveal-delay', Math.min(index % 6, 5) * 0.04 + 's');});
    var observer=new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if(entry.isIntersecting){
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    },{threshold:0.16, rootMargin:'0px 0px -6% 0px'});
    revealNodes.forEach(function(node){observer.observe(node);});
  } else {
    revealNodes.forEach(function(node){node.classList.add('revealed');});
  }

  var menuButton=document.querySelector('.menu-toggle');
  var mobile=document.getElementById('mobile-navigation');
  if(menuButton&&mobile){menuButton.addEventListener('click',function(){var open=menuButton.getAttribute('aria-expanded')==='true';menuButton.setAttribute('aria-expanded',String(!open));menuButton.setAttribute('aria-label',open?'Open menu':'Close menu');mobile.hidden=open;document.body.classList.remove('brand-preview-open');});mobile.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){mobile.hidden=true;menuButton.setAttribute('aria-expanded','false');menuButton.setAttribute('aria-label','Open menu');});});}

  document.querySelectorAll('[data-current-year]').forEach(function(el){el.textContent=String(new Date().getFullYear());});

  var cfg=window.SITE_CONFIG||{};
  var anyLink=false;
  ['linkedin','github','company'].forEach(function(key){document.querySelectorAll('[data-contact-link="'+key+'"]').forEach(function(el){if(cfg[key]){el.href=cfg[key];el.hidden=false;el.target='_blank';el.rel='noreferrer';anyLink=true;}});});
  document.querySelectorAll('[data-contact-empty]').forEach(function(el){if(anyLink)el.hidden=true;});
  document.querySelectorAll('[data-contact-value]').forEach(function(el){var key=el.getAttribute('data-contact-value');var value=cfg[key];if(value){if(el.tagName==='A'){el.href=key==='email'?'mailto:'+value:value;if(/^https?:/.test(value)){el.target='_blank';el.rel='noreferrer';}}el.textContent=value;el.classList.remove('muted');}});

  var resume=document.getElementById('resume-download');
  if(resume&&cfg.resumePath){resume.href=cfg.resumePath;resume.removeAttribute('aria-disabled');resume.classList.remove('disabled-link');resume.setAttribute('download','');var note=document.getElementById('resume-note');if(note)note.hidden=true;}

  var form=document.getElementById('contact-form');
  if(form){
    var notice=document.getElementById('form-notice');
    function error(name,msg){var field=form.elements[name];var out=document.getElementById(name+'-error');field.setAttribute('aria-invalid',msg?'true':'false');if(msg){out.textContent=msg;out.hidden=false;field.setAttribute('aria-describedby',name+'-error');}else{out.textContent='';out.hidden=true;field.removeAttribute('aria-describedby');}}
    form.addEventListener('submit',function(e){e.preventDefault();if(notice){notice.hidden=true;notice.textContent='';}
      var name=form.elements.name.value.trim(), email=form.elements.email.value.trim(), subject=form.elements.subject.value.trim(), message=form.elements.message.value.trim();
      var ok=true; error('name',name?'':'Please enter your name.');if(!name)ok=false;
      var valid=/^\S+@\S+\.\S+$/.test(email);error('email',valid?'':'Enter a valid email address.');if(!valid)ok=false;
      error('subject',subject?'':'Please add a subject.');if(!subject)ok=false;
      error('message',message.length>=20?'':'Please add a little more context (at least 20 characters).');if(message.length<20)ok=false;
      if(!ok)return;
      if(!cfg.email){if(notice){notice.textContent='The contact backend is not configured yet. Your message has not been sent.';notice.hidden=false;}return;}
      var body='Name: '+name+'\nEmail: '+email+'\n\n'+message;
      window.location.href='mailto:'+cfg.email+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
      if(notice){notice.textContent='Your email app should open with this message prepared. The website itself does not submit messages to a server.';notice.hidden=false;}
    });
  }

  /* Brand hover spotlight: hovering/focusing the top-bar AVATAR shows the
     signature + name in a transparent centered popup with blurred backdrop.
     Name hover does nothing. Overlay is pointer-events:none so links stay
     clickable. */
  (function brandPreview(){
    var brand=document.querySelector('.brand');
    if(!brand) return;
    var trigger=brand.querySelector('.brand-avatar') || brand;
    var prefix='';
    try {
      var cssLink=document.querySelector('link[href*="assets/css/base.css"]');
      if(cssLink){ prefix=cssLink.getAttribute('href').replace(/assets\/css\/base\.css.*$/, ''); }
    } catch(e){}
    var overlay=document.createElement('div');
    overlay.className='brand-preview-overlay';
    overlay.setAttribute('aria-hidden','true');
    var card=document.createElement('div');
    card.className='brand-preview-card';
    var sig=document.createElement('img');
    sig.className='brand-preview-signature';
    sig.src=prefix+'assets/images/signature.png';
    sig.alt='Bikram Adhikari signature';
    sig.width=640; sig.height=433; sig.decoding='async';
    var name=document.createElement('p');
    name.className='brand-preview-name';
    name.textContent='Bikram Adhikari';
    var sub=document.createElement('p');
    sub.className='brand-preview-sub';
    sub.textContent='Technology Entrepreneur · Software Engineer · Educator';
    var bio=document.createElement('p');
    bio.className='brand-preview-bio';
    bio.innerHTML='I co-founded <strong>Consica Labs</strong> with a vision to build meaningful technology for a global audience. As Founder &amp; CEO, I lead the development of products across <strong>AI, EdTech, SaaS, software, and robotics</strong>, turning ambitious ideas into real-world products, platforms, and technology ecosystems.';
    card.appendChild(sig); card.appendChild(name); card.appendChild(sub); card.appendChild(bio);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    function show(){ document.body.classList.add('brand-preview-open'); }
    function hide(){ document.body.classList.remove('brand-preview-open'); }
    try { trigger.setAttribute('tabindex','0'); } catch(e){}
    var canHover=false;
    try { canHover=window.matchMedia('(hover: hover)').matches; } catch(e){ canHover=true; }
    if(canHover){
      trigger.addEventListener('mouseenter', show);
      trigger.addEventListener('mouseleave', hide);
    }
    trigger.addEventListener('focusin', show);
    trigger.addEventListener('focusout', hide);
    brand.addEventListener('click', hide);
    window.addEventListener('scroll', hide, {passive:true});
    /* Mobile home: show the profile card on first load (no hover on touch).
       Hides on scroll, brand tap, or menu open like desktop. */
    try {
      var isHome = !!document.querySelector('.hero');
      var isMobileView = window.matchMedia('(max-width: 700px)').matches;
      if (isHome && isMobileView) { window.setTimeout(show, 600); }
    } catch(e) {}
  })();
})();
