
// Math.sign polyfill
if (!Math.sign) {
    Math.sign = function(x) { return x ? x < 0 ? -1 : 1 : 0 };
}

var PARTICLE_LINE_WIDTH = 1;
var MAX_PARTICLE_AGE = 100;
var FADE_FILL_STYLE = 'rgba(0, 0, 0, 0.97)';

// The palette can be easily tuned by adding colors.
var palette = [
    "#d73027",
    "#d73027",
    "#f46d43",
    "#f46d43",
    "#fdae61",
    "#fee090",
    "#ffffbf",
    "#e0f3f8",
    "#abd9e9",
    "#74add1",
    "#6694d1",
    "#4575b4"
];

// Draw objects
var af;
var buckets = [];
var NUMBER_BUCKETS = palette.length;
var particles = [];
var DOMElement;

// Simulation vars
var xPixels = 100;
var yPixels = 100;
var gridSize = xPixels * yPixels;
var gridScale = 100 * Math.sqrt(2);
var nbSamples;
var simulationType = 'gaussian';

// Simulation objects
var vortices = [];
var vortexSpeeds = [];
var vortexRanges = [];
var nbVortices = 100;
var MAX_VORTEX_NUMBER = 150;
var maxVectorFieldNorm = 5;

// Interaction objects
var isRightMouseDown = false;
var isLeftMouseDown = false;
var vortexAugmentationTimeout;
var REFRESH_RATE = 16; // 60 fps
var mouseRepulsionActive = false;
var mousePosition = [0, 0];

var g = null;

var Windy =
    {
        start: function(
            element, screenWidth, screenHeight, nbParticles, type)
        {
            this.end();
            DOMElement = element;
            g = DOMElement.getContext("2d");
            xPixels = screenWidth;
            yPixels = screenHeight;
            gridSize = xPixels * yPixels;
            gridScale = Math.sqrt(Math.pow(xPixels, 2) + Math.pow(yPixels, 2));
            nbSamples = nbParticles;
            if (type) simulationType = type;
            vortices = [];
            vortexSpeeds = [];
            vortexRanges = [];
            particles = [];
            buckets = [];

            this.makeVectorField();
            this.makeBuckets();
            this.makeParticles();
            this.animate();

            var windy = document.getElementById('windy');
            windy.addEventListener('contextmenu', function(e) {e.preventDefault()});
            windy.addEventListener('mousedown', this.mouseDownCallback.bind(this));
            windy.addEventListener('mouseup', this.mouseUpCallback.bind(this));
            windy.addEventListener('mousemove', this.mouseMoveCallback.bind(this));
            windy.addEventListener('mouseout', function() {mouseRepulsionActive = false}.bind(this));
        },

        end: function() {
            cancelAnimationFrame(af);
        },

        animate: function() {
            af = requestAnimationFrame(this.animate.bind(this));
            this.update();
            this.draw();
        },

        makeBuckets: function() {
            // 1 bucket per color, NUMBER_BUCKETS colors.
            buckets = // Array.from(Array(NUMBER_BUCKETS).keys()).map(function(){return []});
                Array.apply(null, new Array(NUMBER_BUCKETS)).map(function(){return []});
        },

        addParticleToDrawBucket: function(particle, vector) {
            var maxVectorNorm = maxVectorFieldNorm;
            var thisVectorNorm = this.computeNorm(vector);
            var nbBuckets = buckets.length;

            var bucketIndex =
                thisVectorNorm < 0.001 ? 0 :
                    thisVectorNorm >= maxVectorNorm ? nbBuckets - 1 :
                        Math.ceil(nbBuckets * thisVectorNorm / maxVectorNorm);

            bucketIndex = bucketIndex >= buckets.length ? bucketIndex - 1 : bucketIndex;
            buckets[bucketIndex].push(particle);
        },

        makeParticles: function() {
            for (var i = 0; i < nbSamples; ++i)
                particles.push(this.newParticle(i));
        },

        newParticle: function(particleRank) {
            var x0 = Math.floor(Math.random() * xPixels);
            var y0 = Math.floor(Math.random() * yPixels);
            return {
                x: x0,
                y: y0,
                xt: x0 + 0.01 * Math.random(),
                yt: y0 + 0.01 * Math.random(),
                age: Math.floor(Math.random() * MAX_PARTICLE_AGE),
                rank: particleRank
            };
        },

        evolveVectorField: function() {
            for (var vortex1Id = 0; vortex1Id < nbVortices; ++vortex1Id) {
                var vortex1 = vortices[vortex1Id];
                var o1 = vortex1[3] > 0; // orientation
                var mass1 = Math.abs(vortex1[3]);
                var charge1 = vortex1[2];
                var acceleration = [0, 0];
                // repulsion
                var coeff = 1 / gridScale; // 0.1;

                for (var vortex2Id = 0; vortex2Id < nbVortices; ++vortex2Id) {
                    if (vortex2Id === vortex1Id) continue;

                    var vortex2 = vortices[vortex2Id];
                    var o2 = vortex2[3] > 0;

                    var delta0 = coeff * (vortex1[0] - vortex2[0]);
                    var delta1 = coeff * (vortex1[1] - vortex2[1]);
                    var d2 =
                        Math.pow(delta0, 2) +
                        Math.pow(delta1, 2);

                    // Everything is repulsive
                    var sign = 1;
                    // Same sign vortices are attracted, opposite sign are repulsed
                    // o1 === o2 ? 1 : -1;

                    // !! Eulerian physics
                    // !! Charge could also be vortexI[3]
                    // !! Mass could also be vortexI[2]
                    var charge2 = vortex2[2];
                    var mass2 = Math.abs(vortex2[3]);
                    if (Math.abs(delta0) > 0.0001)
                        acceleration[0] += sign * Math.abs(charge1 * charge2 * mass1 * mass2) * delta0 /
                            (d2 * d2 * Math.abs(delta0));
                    if (Math.abs(delta1) > 0.0001)
                        acceleration[1] += sign * Math.abs(charge1 * charge2 * mass1 * mass2) * delta1 /
                            (d2 * d2 * Math.abs(delta1));
                }

                // Add four walls
                // coeff = 0.5;
                var v0x = coeff * vortex1[0]; var v0y = coeff * vortex1[1];
                var d0x = - coeff * xPixels + v0x; var d0y = - coeff * yPixels + v0y;
                var da = 0;
                if (Math.abs(v0x) > 0.001) {
                    da = (v0x) / (v0x * v0x * Math.abs(v0x));
                    acceleration[0] += da;
                    acceleration[1] += da * Math.sign(vortex1[3]);
                }
                if (Math.abs(d0x) > 0.001) {
                    da = (d0x) / (d0x * d0x * Math.abs(d0x));
                    acceleration[0] += da;
                    acceleration[1] += da * Math.sign(vortex1[3]);
                }
                if (Math.abs(v0y) > 0.001) {
                    da = (v0y) / (v0y * v0y * Math.abs(v0y));
                    acceleration[1] += da;
                    acceleration[0] -= da * Math.sign(vortex1[3]);
                }
                if (Math.abs(d0y) > 0.001) {
                    da = (d0y) / (d0y * d0y * Math.abs(d0y));
                    acceleration[1] += da;
                    acceleration[0] -= da * Math.sign(vortex1[3]);
                }

                // Add mouse
                if (mouseRepulsionActive) {
                    coeff *= 0.4;
                    var deltaX = coeff * (vortex1[0] - mousePosition[0]);
                    var deltaY = coeff * (vortex1[1] - mousePosition[1]);
                    var dist = deltaX * deltaX + deltaY * deltaY;
                    // Doesn't seem to matter after all...
                    if (Math.abs(deltaX) > 0.001) acceleration[0] += deltaX / (dist * dist * Math.abs(deltaX));
                    if (Math.abs(deltaY) > 0.001) acceleration[1] += deltaY / (dist * dist * Math.abs(deltaY));
                }

                var speedX = vortexSpeeds[vortex1Id][0] + 0.000001 * acceleration[0];
                var speedY = vortexSpeeds[vortex1Id][1] + 0.000001 * acceleration[1];

                vortexSpeeds[vortex1Id][0] = Math.sign(speedX) * Math.min(Math.abs(speedX), 0.3);
                vortexSpeeds[vortex1Id][1] = Math.sign(speedY) * Math.min(Math.abs(speedY), 0.3);

                var np0 = vortex1[0] + vortexSpeeds[vortex1Id][0];
                var np1 = vortex1[1] + vortexSpeeds[vortex1Id][1];
                vortex1[0] = Math.min(Math.max(np0, 0), xPixels);
                vortex1[1] = Math.min(Math.max(np1, 0), yPixels);

                // Update swiper.
                vortexRanges[vortex1Id] = this.computeVortexRange(vortex1);
            }
        },

        computeVortexRange: function(vortex) {
            var fadeCoefficient = 100;
            return [
                vortex[0] - vortex[2] * fadeCoefficient,
                vortex[0] + vortex[2] * fadeCoefficient,
                vortex[1] - vortex[2] * fadeCoefficient,
                vortex[1] + vortex[2] * fadeCoefficient
            ]
        },

        computeVectorFieldAt: function(xp, yp)
        {
            if (xp <= 1 || xp >= xPixels - 1 || yp <= 1 || yp >= yPixels - 1)
                return null;

            var mean = [0, 0];
            for (var vi = 0; vi < nbVortices; ++vi) {
                var vp = vortices[vi];
                var bounds = vortexRanges[vi];
                if (xp < bounds[0] || xp > bounds[1] || yp < bounds[2] || yp > bounds[3])
                    continue;

                // Distance to current vortex
                var delta0 = vp[0] - xp;
                var delta1 = vp[1] - yp;
                var d2 = delta0 * delta0 + delta1 * delta1;

                // To be clear with what we do here:
                // var gamma = vp[2] * gridScale;
                // var delta = [vp[0] - xp, vp[1] - yp, 0];
                // var up = [0, 0, vp[3]];

                // Cross product (the one used there)
                // var cross = [delta[1] * up[2], -delta[0] * up[2]];

                // Cute but odd (mangled cross product, interesting visual)
                // var cross = [delta[0] * up[2], -delta[1] * up[2]];

                var extinction = Math.exp(-d2 / (vp[2] * gridScale));
                mean[0] += extinction * delta1 * vp[3];    // cross[0];
                mean[1] += extinction * (-delta0 * vp[3]); // cross[1];
            }
            return mean;
        },

        makeVectorField: function() {
            vortices.length = 0;
            for (var v = 0; v < nbVortices; ++v) {
                var sg = Math.random() > 0.5 ? 1 : -1;
                var newVortex = [
                    Math.min(Math.random() * xPixels + 20, xPixels - 20), // x position
                    Math.min(Math.random() * yPixels + 20, yPixels - 20), // y position
                    5.0 * Math.max(0.25, Math.random()), // gaussian range
                    0.2 * sg * Math.max(Math.min(Math.random(), 0.5), 0.4) // gaussian intensity and clockwiseness
                ];

                vortices.push(newVortex);

                // Initial speeds
                vortexSpeeds.push([
                    0, // Math.random() - 0.5,
                    0  // Math.random() - 0.5
                ]);

                vortexRanges.push(this.computeVortexRange(newVortex));
            }
        },

        isNullVectorFieldAt: function(fx, fy)
        {
            return (fx <= 1 || fx >= xPixels - 1 || fy <= 1 || fy >= yPixels - 1);
        },

        computeNorm: function(vector) {
            return Math.sqrt(Math.pow(vector[0], 2) + Math.pow(vector[1], 2));
        },

        update: function() {
            // Empty buckets.
            for (var b = 0; b < buckets.length; ++b) buckets[b].length = 0;

            // Move particles and add them to buckets.
            for (var p = 0; p < particles.length; ++p) {
                var particle = particles[p];

                if (particle.age > MAX_PARTICLE_AGE) {
                    particles[particle.rank] = this.newParticle(particle.rank);
                }

                var x = particle.x;
                var y = particle.y;
                var v = this.computeVectorFieldAt(x, y);  // vector at current position

                if (v === null) {
                    // This particle is outside the grid
                    particle.age = MAX_PARTICLE_AGE;
                } else {
                    var xt = x + v[0];
                    var yt = y + v[1];

                    if (!this.isNullVectorFieldAt(xt, yt)) {
                        // The path of this particle is visible
                        particle.xt = xt;
                        particle.yt = yt;

                        if (Math.abs(x - xt) > 0.5 || Math.abs(y - yt) > 0.5) {
                            this.addParticleToDrawBucket(particle, v);
                        }
                    } else {
                        // This particle isn't visible, but still moves through the field.
                        particle.x = xt;
                        particle.y = yt;
                    }
                }

                particle.age += 1;
            }

            this.evolveVectorField();
        },

        // Enhancement: try out twojs
        // (Not a fan of the loading overhead)
        draw: function() {
            g.lineWidth = PARTICLE_LINE_WIDTH;
            g.fillStyle = FADE_FILL_STYLE;
            g.mozImageSmoothingEnabled = false;
            g.webkitImageSmoothingEnabled = false;
            g.msImageSmoothingEnabled = false;
            g.imageSmoothingEnabled = false;

            // Fade existing particle trails.
            var prev = g.globalCompositeOperation;
            g.globalCompositeOperation = "destination-in";
            g.fillRect(0, 0, xPixels, yPixels);
            g.globalCompositeOperation = prev;

            // Draw new particle trails.
            var nbBuckets = buckets.length;
            for (var b = 0; b < nbBuckets; ++b) {
                var bucket = buckets[b];
                if (bucket.length > 0) {
                    g.beginPath();
                    g.strokeStyle = palette[b];
                    for (var p = 0; p < bucket.length; ++p) {
                        var particle = bucket[p];
                        var x = particle.x;
                        var xt = particle.xt;
                        var y = particle.y;
                        var yt = particle.yt;
                        // (This was for better extremal sampling:)
                        // g.moveTo(x - (xt - x) * 1.1, y - (yt - y) * 1.1);
                        // g.lineTo(xt + (xt - x) * 1.1, yt + (yt - y) * 1.1);
                        g.moveTo(x, y);
                        g.lineTo(xt, yt);
                        particle.x = xt;
                        particle.y = yt;
                    }
                    g.stroke();
                }
            }
        },

        getEventPositionInCanvas: function(event) {
            // YES, this is quick and dirty, please <i>please</i> be indulgent.
            var windyElement = document.getElementById('windy');
            var rect = windyElement.getBoundingClientRect();
            var top = rect.top;
            var left = rect.left;
            return [event.clientX - left, event.clientY - top];
        },

        mouseDownCallback: function(event) {
            if (isLeftMouseDown) {
                // This should be possible with alt-tab, maybe.
                console.log('[MouseDownCallBack]: multiple mousedown events ' +
                    'without a mouseup.');
                return;
            }
            isLeftMouseDown = true;

            // Get coordinates for the click.
            var positionInCanvas = this.getEventPositionInCanvas(event);
            var sx = positionInCanvas[0];
            var sy = positionInCanvas[1];

            // Kind of a polyfill for detecting a right-click,
            var rightclick =
                event.which ? (event.which === 3) :
                    event.button ? event.button === 2 : false;

            // We make it so the added vortex is always the last.
            var newVortex = [sx, sy, 1, rightclick ? -0.1 : 0.1];
            var newRange = this.computeVortexRange(newVortex);
            if (nbVortices < MAX_VORTEX_NUMBER) {
                nbVortices += 1;
            } else {
                vortices.shift();
                vortexRanges.shift();
                vortexSpeeds.shift();
            }
            vortices.push(newVortex);
            vortexRanges.push(newRange);
            vortexSpeeds.push([0, 0]);

            // Then we can progressively augment the size and speed of the created vortex.
            vortexAugmentationTimeout = setTimeout(
                this.augmentCreatedVortex.bind(this), REFRESH_RATE
            );
        },

        augmentCreatedVortex: function() {
            var lastVortexIndex = vortices.length - 1;
            var lastVortex = vortices[lastVortexIndex];

            if (mouseRepulsionActive) {
                lastVortex[0] = mousePosition[0];
                lastVortex[1] = mousePosition[1];
            }

            // Augment vortex.
            lastVortex[2] = Math.min(lastVortex[2] + 0.02, 5);
            if (lastVortex[3] > 0)
                lastVortex[3] = Math.min(lastVortex[3] + 0.01, 0.2);
            else
                lastVortex[3] = Math.max(lastVortex[3] - 0.01, -0.2);

            // Recompute vortex range.
            // Not strictly necessary: this is done at every vortex field evolution.
            vortexRanges[lastVortexIndex] = this.computeVortexRange(lastVortex);

            // Call again.
            vortexAugmentationTimeout = setTimeout(
                this.augmentCreatedVortex.bind(this), REFRESH_RATE
            );
        },

        mouseUpCallback: function(event) {
            mouseRepulsionActive = false;

            event.preventDefault();
            clearTimeout(vortexAugmentationTimeout);

            isLeftMouseDown = false;
        },

        mouseMoveCallback: function(event) {
            // Prevent dragging the canvas
            event.preventDefault();

            // Get new pointer position.
            var positionInCanvas = this.getEventPositionInCanvas(event);
            var sx = positionInCanvas[0];
            var sy = positionInCanvas[1];
            mousePosition = [sx, sy];

            // Check mouse status
            if (!isLeftMouseDown && !isRightMouseDown) {
                mouseRepulsionActive = true;
                return;
            }

            var lastVortexIndex = vortices.length - 1;
            var lastVortex = vortices[lastVortexIndex];

            var oldX = lastVortex[0];
            var oldY = lastVortex[1];
            var lastSpeed = vortexSpeeds[lastVortexIndex];
            var deltaX = sx - oldX;
            var deltaY = sy - oldY;

            lastSpeed[0] = Math.sign(deltaX) * Math.sqrt(Math.pow(deltaX / 500, 2));
            lastSpeed[1] = Math.sign(deltaY) * Math.sqrt(Math.pow(deltaY / 500, 2));

            lastVortex[0] = sx;
            lastVortex[1] = sy;
        }
    };

// 'Polyfill'
if (!window.requestAnimationFrame) {
    Windy = { start: function(){}, end: function(){} };
}
