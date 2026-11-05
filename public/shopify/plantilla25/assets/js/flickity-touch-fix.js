/* Flickity touch fix: permite scroll vertical en móvil mientras
   mantiene el swipe horizontal para navegación del slideshow.
   Intercepta touchmove en fase capture antes de que Flickity llame preventDefault. */
(function () {
  'use strict';

  if (!window.matchMedia('(max-width: 767px)').matches) return;

  var touchStartX = 0;
  var touchStartY = 0;
  var isVerticalScroll = false;
  var activeSlideshow = null;

  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) {
      isVerticalScroll = false;
      activeSlideshow = null;
      return;
    }
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    isVerticalScroll = false;

    var target = e.target;
    while (target && target !== document) {
      if (target.classList && (target.classList.contains('slideshow') || target.classList.contains('slideshow-element') || target.tagName === 'SLIDESHOW-ELEMENT')) {
        activeSlideshow = target;
        break;
      }
      target = target.parentElement;
    }
  }, { passive: true, capture: true });

  document.addEventListener('touchmove', function (e) {
    if (e.touches.length !== 1 || !activeSlideshow) return;

    var dx = Math.abs(e.touches[0].clientX - touchStartX);
    var dy = Math.abs(e.touches[0].clientY - touchStartY);

    if (dy > dx && dy > 10) {
      isVerticalScroll = true;
    }

    if (isVerticalScroll) {
      e.stopImmediatePropagation();
      e.preventDefault = function () {};
    }
  }, { passive: true, capture: true });

  document.addEventListener('touchend', function () {
    isVerticalScroll = false;
    activeSlideshow = null;
  }, { passive: true, capture: true });

  function patchFlickity() {
    if (typeof window.Flickity === 'undefined') return;

    var proto = window.Flickity.prototype;
    if (!proto || proto._touchFixed) return;
    proto._touchFixed = true;

    if (proto.handleDragMove) {
      var original = proto.handleDragMove;
      proto.handleDragMove = function (event, pointer, moveVector) {
        if (!this.isDraggable) return;
        if (!moveVector) return original.call(this, event, pointer, moveVector);

        var dx = Math.abs(moveVector.x);
        var dy = Math.abs(moveVector.y);

        if (dy > dx) {
          if (this.isDragging) {
            this.isDragging = false;
          }
          return;
        }

        return original.call(this, event, pointer, moveVector);
      };
    }

    if (proto.bindHandles) {
      var originalBind = proto.bindHandles;
      proto.bindHandles = function () {
        this.touchActionValue = 'pan-y';
        return originalBind.call(this);
      };
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(patchFlickity, 50);
      setTimeout(patchFlickity, 300);
      setTimeout(patchFlickity, 1000);
      setTimeout(patchFlickity, 2000);
    });
  } else {
    setTimeout(patchFlickity, 50);
    setTimeout(patchFlickity, 300);
    setTimeout(patchFlickity, 1000);
    setTimeout(patchFlickity, 2000);
  }

  document.addEventListener('page:loaded', function () {
    setTimeout(patchFlickity, 50);
    setTimeout(patchFlickity, 300);
  });
})();
