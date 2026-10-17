// crawler.js - Spider simulation with IK, gait, and thread mechanics
// Handles spider movement, foot placement, and animation

const CONFIG = {
    // Body properties
    bodyScale: 1.0,          // Overall size multiplier
    bodyLength: 90,          // Base body length in pixels
    bodyWidth: 30,           // Base body width

    // Leg properties
    legSegments: 2,          // Number of segments per leg
    legLength: [45, 35],     // Length of each segment [upper, lower]
    legSpacing: 15,          // Distance between legs along body
    kneeAngle: -30,          // Default knee bend angle (degrees)

    // Movement properties
    baseSpeed: 0.3,          // Base movement speed (units per second)
    speedVariation: 0.2,     // Random speed variation (0-1)
    wanderStrength: 0.5,     // Heading wander strength
    wanderFrequency: 0.1,    // How often heading changes
    stepHeight: 15,          // Maximum step height
    stepDuration: 0.15,      // Time for step lift-swing-plant (seconds)
    stepThreshold: 20,       // Distance to trigger a step

    // Thread properties
    threadLength: 100,       // Initial thread length
    threadSwayFreq: 0.5,     // Thread sway frequency
    threadSwayAmount: 20,    // Thread sway amount (pixels)
    threadSnapLength: 150,   // Length at which thread snaps

    // Performance
    maxDPR: 2,               // Maximum device pixel ratio
    fxaa: true,              // Enable FXAA anti-aliasing

    // Debug
    debug: false             // Show debug info
};

class SpiderCrawler {
    constructor(canvas, paperLoader) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.paperLoader = paperLoader;

        // Spider state
        this.bodyPos = { x: 0, y: 0 }; // Center of body in document space
        this.bodyAngle = 0;            // Body rotation (radians)
        this.legs = [];                // Leg joint positions
        this.feet = [];                // Foot positions and word attachments
        this.thread = null;            // Silk thread state
        this.trail = [];               // Recent foot positions for silk threads

        // Movement state
        this.velocity = { x: 0, y: 0 };
        this.heading = 0;              // Movement direction (radians)
        this.targetHeading = 0;        // Target heading for wandering
        this.speed = CONFIG.baseSpeed;
        this.isPaused = false;
        this.isFollowingCursor = false;
        this.cursorChaseStrength = 0.1;

        // Timing
        this.lastTime = 0;
        this.stepTimers = [];          // Timer for each leg's step cycle
        this.lastSectionChange = 0;

        // Initialize spider
        this.initSpider();

        // Input state
        this.keys = {};
        this.cursorPos = { x: 0, y: 0 };

        // Bind event listeners
        this.bindEvents();

        // Animation frame
        this.animationFrame = null;
    }

    initSpider() {
        // Initialize 8 legs (4 pairs)
        this.legs = [];
        for (let i = 0; i < 4; i++) {
            // Left side legs (negative offset)
            this.legs.push({
                side: 'left',
                index: i,
                offset: -((i * 2 + 1) * CONFIG.legSpacing),
                joints: [ // [body joint, knee, foot]
                    { x: 0, y: 0 },
                    { x: 0, y: 0 },
                    { x: 0, y: 0 }
                ],
                phase: (i % 2) === 0 ? 0 : 0.5, // Alternating tetrapod gait
                isStepping: false,
                stepProgress: 0
            });

            // Right side legs (positive offset)
            this.legs.push({
                side: 'right',
                index: i,
                offset: ((i * 2 + 1) * CONFIG.legSpacing),
                joints: [
                    { x: 0, y: 0 },
                    { x: 0, y: 0 },
                    { x: 0, y: 0 }
                ],
                phase: (i % 2) === 0 ? 0.5 : 0, // Opposite phase to left
                isStepping: false,
                stepProgress: 0
            });
        }

        // Initialize feet states
        this.feet = this.legs.map(() => ({
            wordIndex: null,
            localOffset: { x: 0.5, y: 0.5 },
            position: { x: 0, y: 0 },
            targetPosition: { x: 0, y: 0 },
            silkAge: 0
        }));

        // Initialize thread
        this.thread = {
            length: CONFIG.threadLength,
            swayOffset: 0,
            swayVelocity: 0,
            anchor: { x: 0, y: 0 }, // Screen space anchor
            bob: 0                  // Vertical bounce
        };

        // Initialize step timers
        this.stepTimers = this.legs.map(() => Math.random() * CONFIG.stepDuration);
    }

    bindEvents() {
        // Mouse events
        this.canvas.addEventListener('mousemove', (e) => {
            const rect = this.canvas.getBoundingClientRect();
            this.cursorPos = {
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            };
        });

        this.canvas.addEventListener('mousedown', (e) => {
            // Ignore if clicking on links or UI elements
            if (e.target.tagName === 'A' ||
                e.target.closest('#analyst-panel') ||
                e.target.closest('.markup-overlay')) {
                return;
            }

            this.isFollowingCursor = true;
            this.targetHeading = Math.atan2(
                this.cursorPos.y - (this.canvas.height / 2),
                this.cursorPos.x - (this.canvas.width / 2)
            );
        });

        // Keyboard events
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;

            // Handle shortcuts only when no modifier keys and not in input
            if (!e.ctrlKey && !e.metaKey && !e.altKey &&
                e.target.tagName !== 'INPUT' &&
                e.target.tagName !== 'TEXTAREA' &&
                e.target.isContentEditable !== true) {

                switch (e.code) {
                    case 'Space':
                        this.isPaused = !this.isPaused;
                        break;
                    case 'KeyF':
                        this.isFollowingCursor = !this.isFollowingCursor;
                        break;
                    case 'KeyT':
                        // Toggle title overlay - handled in main app
                        break;
                    case 'Digit1':
                    case 'Digit2':
                    case 'Digit3':
                        // Change intensity - handled in main app
                        break;
                    case 'KeyB':
                    case 'KeyS':
                    case 'KeyR':
                        // Change level - handled in main app
                        break;
                    case 'KeyE':
                        // Explain selection - handled in main app
                        break;
                    case 'KeyC':
                        // Clear markup - handled in main app
                        break;
                    case 'KeyD':
                        // Re-drop spider - handled in main app
                        break;
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
        });

        // Visibility change
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.pause();
            } else {
                this.resume();
            }
        });
    }

    pause() {
        this.isPaused = true;
    }

    resume() {
        this.isPaused = false;
        this.lastTime = performance.now();
    }

    update(deltaTime, paperViewRect) {
        if (this.isPaused) return;

        // Update timing
        deltaTime = Math.min(deltaTime, 50); // Clamp to prevent large jumps

        // Update heading with wander
        this.updateHeading(deltaTime / 1000);

        // Update velocity based on heading and speed
        this.velocity = {
            x: Math.cos(this.heading) * this.speed,
            y: Math.sin(this.heading) * this.speed
        };

        // Apply cursor chasing
        if (this.isFollowingCursor) {
            const dx = this.cursorPos.x - (this.canvas.width / 2);
            const dy = this.cursorPos.y - (this.canvas.height / 2);
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 10) {
                const chaseAngle = Math.atan2(dy, dx);
                this.heading = this.heading * (1 - this.cursorChaseStrength) +
                              chaseAngle * this.cursorChaseStrength;
            }
        }

        // Update body position
        this.bodyPos.x += this.velocity.x * (deltaTime / 1000);
        this.bodyPos.y += this.velocity.y * (deltaTime / 1000);

        // Keep spider within reasonable bounds (optional boundary)
        this.constrainToView(paperViewRect);

        // Update thread physics
        this.updateThread(deltaTime / 1000);

        // Update leg IK and stepping
        this.updateLegs(deltaTime / 1000, paperViewRect);

        // Update foot positions based on word attachments
        this.updateFeet();

        // Update silk trail
        this.updateTrail(deltaTime / 1000);

        // Check for section changes
        this.checkSectionChanges();
    }

    updateHeading(dt) {
        // Add noise-driven wander
        const wanderNoise = (Math.random() - 0.5) * 2 * CONFIG.wanderStrength;
        this.targetHeading += wanderNoise * CONFIG.wanderFrequency * dt;

        // Smoothly interpolate toward target heading
        const angleDiff = this.angleDifference(this.targetHeading, this.heading);
        this.heading += angleDiff * 0.1 * dt * 10; // Smooth turning

        // Keep heading in reasonable range
        while (this.heading > Math.PI) this.heading -= 2 * Math.PI;
        while (this.heading < -Math.PI) this.heading += 2 * Math.PI;
    }

    angleDifference(a, b) {
        let diff = b - a;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        return diff;
    }

    constrainToView(paperViewRect) {
        // Optional: keep spider near center of view
        const centerX = paperViewRect.left + paperViewRect.width / 2;
        const centerY = paperViewRect.top + paperViewRect.height / 2;

        // Gentle center-seeking force
        const dx = centerX - this.bodyPos.x;
        const dy = centerY - this.bodyPos.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance > 200) { // Only apply if far from center
            const force = 0.0001; // Weak force
            this.velocity.x += dx * force;
            this.velocity.y += dy * force;
        }
    }

    updateThread(dt) {
        // Thread sway as damped pendulum
        const damping = 0.95;
        const frequency = CONFIG.threadSwayFreq;

        // Sway oscillation
        this.thread.swayOffset += this.thread.swayVelocity * dt;
        this.thread.swayVelocity += (-this.thread.swayOffset * frequency * frequency -
                                   this.thread.swayVelocity * 2 * 0.1 * frequency) * dt;
        this.thread.swayVelocity *= damping;

        // Thread bob (up-down bounce)
        this.thread.bob += 0.5 * dt; // Slow bounce
        if (this.thread.bob > Math.PI * 2) this.thread.bob -= Math.PI * 2;

        // Check if thread should snap
        const threadEndY = -CONFIG.threadLength +
                          Math.sin(this.thread.bob) * 10 + // Small bounce
                          this.thread.swayOffset;

        if (threadEndY < -CONFIG.threadSnapLength) {
            // Thread snapped - reset spider position
            this.resetSpider();
        }
    }

    resetSpider() {
        // Reset spider to initial position above viewport
        this.bodyPos = { x: 0, y: -200 };
        this.bodyAngle = 0;
        this.velocity = { x: 0, y: 0 };
        this.heading = 0;
        this.targetHeading = 0;

        // Reset legs to tucked position
        this.legs.forEach(leg => {
            leg.joints[0] = { x: 0, y: 0 }; // Body joint
            leg.joints[1] = { x: 0, y: -20 }; // Knee tucked up
            leg.joints[2] = { x: 0, y: -40 }; // Foot tucked up
            leg.isStepping = false;
            leg.stepProgress = 0;
        });

        // Reset feet
        this.feet.forEach(foot => {
            foot.wordIndex = null;
            foot.position = { x: 0, y: 0 };
            foot.targetPosition = { x: 0, y: 0 };
            foot.silkAge = 0;
        });

        // Reset thread
        this.thread.swayOffset = 0;
        this.thread.swayVelocity = 0;
        this.thread.bob = 0;
    }

    updateLegs(dt, paperViewRect) {
        // Update each leg
        this.legs.forEach((leg, legIndex) => {
            // Update step timer
            this.stepTimers[legIndex] += dt;

            // Check if it's time to step based on gait
            const gaitPhase = (this.stepTimers[legIndex] / CONFIG.stepDuration) % 1;
            const shouldStep = leg.isStepping ||
                              (gaitPhase < leg.phase &&
                               this.stepTimers[legIndex] > CONFIG.stepDuration);

            if (shouldStep && !leg.isStepping) {
                leg.isStepping = true;
                leg.stepProgress = 0;
                this.stepTimers[legIndex] = 0;
            }

            if (leg.isStepping) {
                // Update step progress
                leg.stepProgress += dt / CONFIG.stepDuration;

                if (leg.stepProgress >= 1) {
                    leg.isStepping = false;
                    leg.stepProgress = 0;
                }

                // Calculate stepping motion
                const ease = this.easeInOutSine(leg.stepProgress);
                const stepHeight = Math.sin(ease * Math.PI) * CONFIG.stepHeight;

                // For now, implement simple IK reaching
                // In full implementation, this would calculate IK targets
                // based on gait and body movement
            }

            // Calculate target foot position based on gait and body movement
            const target = this.calculateLegTarget(leg, dt);

            // Solve IK for this leg
            this.solveLegIK(leg, target);
        });
    }

    calculateLegTarget(leg, dt) {
        // Calculate where the foot should be based on:
        // 1. Body position and orientation
        // 2. Leg offset along body
        // 3. Gait phase (walking pattern)
        // 4. Ground adaptation (word positions)

        // Convert leg offset to world coordinates
        const offsetX = Math.cos(this.bodyAngle) * leg.offset;
        const offsetY = Math.sin(this.bodyAngle) * leg.offset;

        // Base position (where leg would be if standing still)
        const basePos = {
            x: this.bodyPos.x + offsetX,
            y: this.bodyPos.y + offsetY
        };

        // Apply gait movement
        const gaitOffset = this.calculateGaitOffset(leg, dt);

        return {
            x: basePos.x + gaitOffset.x,
            y: basePos.y + gaitOffset.y
        };
    }

    calculateGaitOffset(leg, dt) {
        // Simple alternating tetrapod gait
        // In reality, this would be more complex with proper gait cycles

        // For now, return small alternating movement
        const phase = (leg.index % 2 === 0) ? 0 : 0.5;
        const timePhase = (performance.now() / 1000) * 0.5 + phase;
        const sway = Math.sin(timePhase) * 5;

        return {
            x: Math.cos(this.heading) * sway * 0.5,
            y: Math.sin(this.heading) * sway * 0.5
        };
    }

    solveLegIK(leg, target) {
        // Analytic two-bone IK using law of cosines
        // Joints: [body joint, knee, foot]

        const bodyJoint = leg.joints[0];
        const targetPos = target;

        // Vector from body joint to target
        const dx = targetPos.x - bodyJoint.x;
        const dy = targetPos.y - bodyJoint.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Clamp distance to reachable range
        const maxReach = CONFIG.legLength[0] + CONFIG.legLength[1];
        const minReach = Math.abs(CONFIG.legLength[0] - CONFIG.legLength[1]);
        let clampedDistance = Math.min(Math.max(distance, minReach), maxReach);

        // If too close, push away slightly
        if (distance < minReach + 1) {
            const angle = Math.atan2(dy, dx);
            clampedDistance = minReach + 1;
            targetPos.x = bodyJoint.x + Math.cos(angle) * clampedDistance;
            targetPos.y = bodyJoint.y + Math.sin(angle) * clampedDistance;
        }

        // Calculate knee angle using law of cosines
        // cos(angle) = (a² + b² - c²) / (2ab)
        const a = CONFIG.legLength[0];
        const b = CONFIG.legLength[1];
        const c = clampedDistance;

        let kneeAngle;
        if (distance > 0.001) {
            const cosKnee = (a * a + b * b - c * c) / (2 * a * b);
            // Clamp to valid range
            const clampedCos = Math.max(-1, Math.min(1, cosKnee));
            kneeAngle = Math.acos(clampedCos);
        } else {
            kneeAngle = Math.PI; // Straight leg
        }

        // Calculate actual knee bend (we want it to bend inward)
        const bendDirection = leg.side === 'left' ? 1 : -1; // Left legs bend right, right legs bend left
        const actualKneeAngle = Math.PI - kneeAngle; // Convert to bend amount

        // Calculate angle from body joint to target
        const targetAngle = Math.atan2(targetPos.y - bodyJoint.y, targetPos.x - bodyJoint.x);

        // Calculate knee joint position
        leg.joints[1].x = bodyJoint.x + Math.cos(targetAngle) * a;
        leg.joints[1].y = bodyJoint.y + Math.sin(targetAngle) * a;

        // Calculate foot position
        leg.joints[2].x = targetPos.x;
        leg.joints[2].y = targetPos.y;

        // Apply knee bend
        const bendAngle = targetAngle + (bendDirection * actualKneeAngle * 0.5);
        leg.joints[1].x = bodyJoint.x + Math.cos(bendAngle) * a * 0.8;
        leg.joints[1].y = bodyJoint.y + Math.sin(bendAngle) * a * 0.8;

        // Recalculate foot to maintain length
        const dx2 = leg.joints[2].x - leg.joints[1].x;
        const dy2 = leg.joints[2].y - leg.joints[1].y;
        const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

        if (len2 > 0.001) {
            leg.joints[2].x = leg.joints[1].x + (dx2 / len2) * b;
            leg.joints[2].y = leg.joints[1].y + (dy2 / len2) * b;
        }
    }

    easeInOutSine(t) {
        return -(Math.cos(Math.PI * t) - 1) / 2;
    }

    updateFeet() {
        // Update each foot's position based on word attachment
        this.feet.forEach((foot, index) => {
            const leg = this.legs[index];
            const footJoint = leg.joints[2]; // Foot joint

            if (foot.wordIndex !== null) {
                // Foot is attached to a word - update position to follow word
                const wordSpan = this.paperLoader.wordSpans[foot.wordIndex];
                if (wordSpan) {
                    const rect = wordSpan.getBoundingClientRect();
                    const docX = rect.left + window.scrollX;
                    const docY = rect.top + window.scrollY;

                    // Calculate position within word based on local offset
                    foot.position.x = docX + rect.width * foot.localOffset.x;
                    foot.position.y = docY + rect.height * foot.localOffset.y;

                    // Check if word has moved significantly (reflow)
                    const dx = foot.position.x - footJoint.x;
                    const dy = foot.position.y - footJoint.y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance > 30) { // Threshold for reflow
                        // Release foot and let it step to new position
                        foot.wordIndex = null;
                    }
                } else {
                    // Word span no longer exists
                    foot.wordIndex = null;
                }
            }

            // If foot is not attached or was released, target the IK foot position
            if (foot.wordIndex === null) {
                foot.targetPosition.x = footJoint.x;
                foot.targetPosition.y = footJoint.y;

                // Smoothly move toward target
                const dx = foot.targetPosition.x - foot.position.x;
                const dy = foot.targetPosition.y - foot.position.y;
                foot.position.x += dx * 0.2;
                foot.position.y += dy * 0.2;
            }
        });
    }

    updateTrail(dt) {
        // Add current body position to trail for silk threads
        this.trail.push({
            x: this.bodyPos.x,
            y: this.bodyPos.y,
            age: 0
        });

        // Limit trail length
        if (this.trail.length > 20) {
            this.trail.shift();
        }

        // Age existing trail points
        this.trail.forEach(point => {
            point.age += dt;
        });

        // Remove old trail points
        this.trail = this.trail.filter(point => point.age < 2.0); // 2 seconds max age
    }

    checkSectionChanges() {
        // This would check if spider has entered a new section
        // and trigger AI explanation if needed
        // Implemented in main app coordination
    }

    draw() {
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Save context for DPR handling
        this.ctx.save();

        // Scale for device pixel ratio
        const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDPR);
        this.ctx.scale(dpr, dpr);

        // Draw spider body
        this.drawBody();

        // Draw legs
        this.drawLegs();

        // Draw silk thread
        this.drawThread();

        // Draw silk trails from abdomen to touched words
        this.drawSilkTrails();

        // Draw debug info if enabled
        if (CONFIG.debug) {
            this.drawDebug();
        }

        this.ctx.restore();
    }

    drawBody() {
        this.ctx.beginPath();
        this.ctx.ellipse(
            this.bodyPos.x,
            this.bodyPos.y,
            CONFIG.bodyWidth * CONFIG.bodyScale / 2,
            CONFIG.bodyLength * CONFIG.bodyScale / 2,
            this.bodyAngle,
            0,
            Math.PI * 2
        );
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fill();
        this.ctx.strokeStyle = 'rgba(30, 30, 30, 0.9)';
        this.ctx.lineWidth = 1 * CONFIG.bodyScale;
        this.ctx.stroke();

        // Draw eye
        const eyeOffsetX = Math.cos(this.bodyAngle) * (CONFIG.bodyLength * 0.3);
        const eyeOffsetY = Math.sin(this.bodyAngle) * (CONFIG.bodyLength * 0.3);
        this.ctx.beginPath();
        this.ctx.arc(
            this.bodyPos.x + eyeOffsetX,
            this.bodyPos.y + eyeOffsetY,
            2 * CONFIG.bodyScale,
            0,
            Math.PI * 2
        );
        this.ctx.fillStyle = 'white';
        this.ctx.fill();
    }

    drawLegs() {
        this.legs.forEach((leg, index) => {
            const isLeft = leg.side === 'left';
            const legColor = CONFIG.primaryColor; // cyan/teal
            const jointColor = CONFIG.secondaryColor; // red

            // Draw leg segments
            for (let i = 0; i < leg.joints.length - 1; i++) {
                const start = leg.joints[i];
                const end = leg.joints[i + 1];

                this.ctx.beginPath();
                this.ctx.moveTo(start.x, start.y);
                this.ctx.lineTo(end.x, end.y);
                this.ctx.strokeStyle = legColor;
                this.ctx.lineWidth = 1.5 * CONFIG.bodyScale;
                this.ctx.stroke();

                // Draw joint
                this.ctx.beginPath();
                this.ctx.arc(end.x, end.y, 2 * CONFIG.bodyScale, 0, Math.PI * 2);
                if (i === leg.joints.length - 2) {
                    // Knee joint
                    this.ctx.fillStyle = jointColor;
                } else if (i === leg.joints.length - 1) {
                    // Foot joint
                    this.ctx.fillStyle = jointColor;
                } else {
                    // Body joint
                    this.ctx.fillStyle = 'rgba(50, 50, 50, 0.8)';
                }
                this.ctx.fill();
            }
        });
    }

    drawThread() {
        // Draw silk thread from anchor to spider
        const anchor = this.thread.anchor;
        const bodyPos = this.bodyPos;

        this.ctx.beginPath();
        this.ctx.moveTo(anchor.x, anchor.y);

        // Calculate sway points along thread
        const segments = 20;
        for (let i = 1; i < segments; i++) {
            const t = i / segments;
            const sway = Math.sin(t * Math.PI * 2 + this.thread.swayOffset) *
                        this.thread.swayAmount * (1 - t);

            // Perpendicular to thread direction
            const dx = bodyPos.x - anchor.x;
            const dy = bodyPos.y - anchor.y;
            const length = Math.sqrt(dx * dx + dy * dy);
            const nx = -dy / length;
            const ny = dx / length;

            const x = anchor.x + dx * t + nx * sway;
            const y = anchor.y + dy * t + ny * sway;

            this.ctx.lineTo(x, y);
        }

        this.ctx.lineTo(bodyPos.x, bodyPos.y);
        this.ctx.strokeStyle = 'rgba(200, 200, 200, 0.6)';
        this.ctx.lineWidth = 1 * CONFIG.bodyScale;
        this.ctx.stroke();

        // Draw anchor point
        this.ctx.beginPath();
        this.ctx.arc(anchor.x, anchor.y, 3 * CONFIG.bodyScale, 0, Math.PI * 2);
        this.ctx.fillStyle = 'rgba(200, 200, 200, 0.8)';
        this.ctx.fill();
    }

    drawSilkTrails() {
        // Draw faint silk threads from abdomen to recently touched words
        this.feet.forEach((foot, index) => {
            if (foot.wordIndex !== null && foot.silkAge > 0) {
                const abdomenPos = {
                    x: this.bodyPos.x,
                    y: this.bodyPos.y + (CONFIG.bodyLength * 0.4) // Lower abdomen
                };

                const alpha = Math.max(0, 1 - foot.silkAge / 3.0); // Fade over 3 seconds
                if (alpha > 0.1) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(abdomenPos.x, abdomenPos.y);
                    this.ctx.lineTo(foot.position.x, foot.position.y);
                    this.ctx.strokeStyle = `rgba(100, 100, 255, ${alpha * 0.3})`;
                    this.ctx.lineWidth = 0.5 * CONFIG.bodyScale;
                    this.ctx.stroke();
                }

                // Age the silk
                foot.silkAge += 1 / 60; // Assuming 60fps
            }
        });
    }

    drawDebug() {
        // Draw IK debug info
        this.legs.forEach((leg, index) => {
            // Draw joint positions
            leg.joints.forEach((joint, i) => {
                this.ctx.beginPath();
                this.ctx.arc(joint.x, joint.y, 3 * CONFIG.bodyScale, 0, Math.PI * 2);
                if (i === 0) {
                    this.ctx.fillStyle = 'rgba(0, 255, 0, 0.8)'; // Body joint - green
                } else if (i === 1) {
                    this.ctx.fillStyle = 'rgba(255, 0, 0, 0.8)'; // Knee - red
                } else {
                    this.ctx.fillStyle = 'rgba(0, 0, 255, 0.8)'; // Foot - blue
                }
                this.ctx.fill();
            });

            // Draw target position if foot is stepping
            if (leg.isStepping) {
                this.ctx.beginPath();
                this.ctx.arc(leg.joints[2].x, leg.joints[2].y, 5 * CONFIG.bodyScale, 0, Math.PI * 2);
                this.ctx.fillStyle = 'rgba(255, 255, 0, 0.5)'; // Yellow
                this.ctx.fill();
            }
        });

        // Draw body heading
        this.ctx.beginPath();
        this.ctx.moveTo(this.bodyPos.x, this.bodyPos.y);
        this.ctx.lineTo(
            this.bodyPos.x + Math.cos(this.heading) * 30,
            this.bodyPos.y + Math.sin(this.heading) * 30
        );
        this.ctx.strokeStyle = 'rgba(255, 0, 255, 0.8)';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();

        // Draw FPS
        this.ctx.font = '12px monospace';
        this.ctx.fillStyle = 'white';
        this.ctx.fillText(`FPS: ${Math.round(1000 / this.lastDeltaTime)}`, 10, 20);
    }

    // Public methods for coordination with other modules
    setBodyPosition(x, y) {
        this.bodyPos = { x, y };
    }

    getBodyPosition() {
        return { ...this.bodyPos };
    }

    attachFootToWord(legIndex, wordIndex, localOffset) {
        if (legIndex >= 0 && legIndex < this.feet.length) {
            const foot = this.feet[legIndex];
            foot.wordIndex = wordIndex;
            foot.localOffset = localOffset || { x: 0.5, y: 0.5 };

            // Immediately position foot on word
            const wordSpan = this.paperLoader.wordSpans[wordIndex];
            if (wordSpan) {
                const rect = wordSpan.getBoundingClientRect();
                const docX = rect.left + window.scrollX;
                const docY = rect.top + window.scrollY;
                foot.position.x = docX + rect.width * foot.localOffset.x;
                foot.position.y = docY + rect.height * foot.localOffset.y;

                // Reset silk age when touching new word
                foot.silkAge = 0;
            }
        }
    }

    releaseFoot(legIndex) {
        if (legIndex >= 0 && legIndex < this.feet.length) {
            this.feet[legIndex].wordIndex = null;
        }
    }

    getFeetPositions() {
        return this.feet.map(f => ({ ...f.position }));
    }

    // Handle window resize
    onResize() {
        this.resizeCanvas();
    }

    resizeCanvas() {
        // Set canvas size to match display size accounting for DPR
        const displayWidth = this.canvas.clientWidth;
        const displayHeight = this.canvas.clientHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDPR);

        this.canvas.width = displayWidth * dpr;
        this.canvas.height = displayHeight * dpr;

        // Reset anchor point to top center of canvas
        this.thread.anchor = {
            x: this.canvas.width / (dpr * 2),
            y: 0
        };
    }

    // Animation loop
    animate(timestamp) {
        if (!this.lastTime) {
            this.lastTime = timestamp;
        }

        const deltaTime = timestamp - this.lastTime;
        this.lastDeltaTime = deltaTime;
        this.lastTime = timestamp;

        // Get paper view rectangle (would be passed from main app)
        const paperViewRect = {
            left: 0,
            top: 0,
            width: this.canvas.width,
            height: this.canvas.height
        };

        this.update(deltaTime, paperViewRect);
        this.draw();

        this.animationFrame = requestAnimationFrame(() => this.animate(timestamp));
    }

    start() {
        this.lastTime = performance.now();
        this.animate(this.lastTime);
    }

    stop() {
        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }
    }
}

// Export for use in other modules
window.SpiderCrawler = SpiderCrawler;