var timeout;
var timeoutLimit = 100;

function tryToAnimate() {
   clearTimeout(animate);
   timeout = setTimeout(animate, timeoutLimit);
}

function getHeight(element) {
   var elementStyle = window.getComputedStyle(element);
   return element.offsetHeight +
       parseInt(elementStyle.marginTop, 10) +
       parseInt(elementStyle.marginBottom, 10);
}

function animate() {
   // Warning! This is quick and dirty, be indulgent.
   var element = document.getElementById('windy');
   var hr = document.getElementById('separator');
   var foot = document.getElementById('footer');
   var navHeight = getHeight(hr) + getHeight(foot);

   var winHeight = window.innerHeight;

   var paddingBottom = 20;
   var width = element.offsetWidth;
   var height = winHeight - navHeight - paddingBottom;
   element.style.height = height.toString();

   var nbSamples =
      Math.floor(Math.min(25 * width * height / 2000, 30000));

   console.log('[script.js] Particle tracing started using ' +
   nbSamples + ' samples.');

   element.setAttribute('width', width.toString());
   element.setAttribute('height', height.toString());
   Windy.start(
      element, width, height, nbSamples
   );
}

window.addEventListener('DOMContentLoaded', tryToAnimate, false);
