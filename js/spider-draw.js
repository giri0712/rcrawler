// spider-draw.js - Canvas rendering utilities for the spider
// Handles drawing the spider body, legs, thread, and effects on canvas

/**
 * Draw the spider on the canvas
 * @param {CanvasRenderingContext2D} ctx - 2D rendering context
 * @param {Object} spiderState - Current state of the spider
 * @param {Object} config - Configuration object
 */
class SpiderDrawer {
    constructor(ctx, config) {
        this.ctx = ctx;
        this.config = config;
    }

    /**
     * Draw the complete spider
     */
    drawSpider(spiderState) {
        this.drawThread(spiderState.thread);
        this.drawBody(spiderState.body);
        this.drawLegs(spiderState.legs);
        this.drawFeet(spiderState.feet);
    }

    /**
     * Draw the silk thread
     */
    drawThread(thread) {
        const ctx = this.ctx;
        const scale = this.config.bodyScale || 1.0;

        ctx.save();
        ctx.strokeStyle = 'rgba(200, 200, 200, 0.6)';
        ctx.lineWidth = 1 * scale;
        ctx.beginPath();

        // Anchor point (top center of screen)
        const anchorX = thread.anchor.x;
        const anchorY = thread.anchor.y;

        // Spider body position
        const bodyX = thread.bodyPos ? thread.bodyPos.x : 0;
        const bodyY = thread.bodyPos ? thread.bodyPos.y : -thread.length;

        // Create swaying thread path
        const segments = 20;
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const swayAmount = thread.swayOffset * (1 - t);
            const sway = Math.sin(t * Math.PI * 2 + thread.swayPhase) * swayAmount;

            // Perpendicular to thread direction
            const dx = bodyX - anchorX;
            const dy = bodyY - anchorY;
            const length = Math.sqrt(dx * dx + dy * dy) || 1;
            const nx = -dy / length;
            const ny = dx / length;

            const x = anchorX + dx * t + nx * sway;
            const y = anchorY + dy * t + ny * sway;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.stroke();
        ctx.restore();
    }

    /**
     * Draw the spider body
     */
    drawBody(body) {
        const ctx = this.ctx;
        const scale = this.config.bodyScale || 1.0;

        ctx.save();
        ctx.translate(body.x, body.y);
        ctx.rotate(body.angle || 0);

        // Body (thorax + abdomen)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.beginPath();
        ctx.ellipse(
            0,
            0,
            (this.config.bodyWidth * scale) / 2,
            (this.config.bodyLength * scale) / 2,
            0,
            0,
            Math.PI * 2
        );
        ctx.fill();
        ctx.strokeStyle = 'rgba(30, 30, 30, 0.9)';
        ctx.lineWidth = 1 * scale;
        ctx.stroke();

        // Eye
        const eyeOffset = this.config.bodyLength * 0.3 * scale;
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(eyeOffset, 0, 2 * scale, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    /**
     * Draw the spider legs
     */
    drawLegs(legs) {
        const ctx = this.ctx;
        const scale = this.config.bodyScale || 1.0;
        const legColor = this.config.legColor || 'rgba(25, 195, 214, 0.8)'; // cyan/teal
        const jointColor = this.config.jointColor || 'rgba(224, 48, 58, 0.9)'; // red

        legs.forEach(leg => {
            // Draw leg segments
            for (let i = 0; i < leg.joints.length - 1; i++) {
                const start = leg.joints[i];
                const end = leg.joints[i + 1];

                ctx.save();
                ctx.strokeStyle = legColor;
                ctx.lineWidth = 1.5 * scale;
                ctx.beginPath();
                ctx.moveTo(start.x, start.y);
                ctx.lineTo(end.x, end.y);
                ctx.stroke();
                ctx.restore();

                // Draw joint
                ctx.save();
                ctx.beginPath();
                ctx.arc(end.x, end.y, 2 * scale, 0, Math.PI * 2);

                if (i === leg.joints.length - 2) {
                    // Knee joint
                    ctx.fillStyle = jointColor;
                } else if (i === leg.joints.length - 1) {
                    // Foot joint
                    ctx.fillStyle = jointColor;
                } else {
                    // Body joint
                    ctx.fillStyle = 'rgba(50, 50, 50, 0.8)';
                }
                ctx.fill();
                ctx.restore();
            }
        });
    }

    /**
     * Draw foot positions and attachment effects
     */
    drawFeet(feet) {
        const ctx = this.ctx;
        const scale = this.config.bodyScale || 1.0;

        feet.forEach((foot, index) => {
            // Draw foot point if visible
            if (foot.visible !== false) {
                ctx.save();
                ctx.fillStyle = 'rgba(224, 48, 58, 0.9)'; // Red dot
                ctx.beginPath();
                ctx.arc(foot.x, foot.y, 3 * scale, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        });
    }

    /**
     * Draw markup effects overlay
     */
    drawMarkupOverlays(markups) {
        const ctx = this.ctx;

        markups.forEach(markup => {
            if (!markup.visible) return;

            ctx.save();
            ctx.globalAlpha = markup.opacity || 0.7;

            switch (markup.type) {
                case 'highlight':
                    this.drawHighlight(ctx, markup);
                    break;
                case 'outline':
                    this.drawOutline(ctx, markup);
                    break;
                case 'blowup':
                    this.drawBlowup(ctx, markup);
                    break;
                case 'rotate':
                    this.drawRotate(ctx, markup);
                    break;
                case 'color':
                    this.drawColorText(ctx, markup);
                    break;
            }

            ctx.restore();
        });
    }

    drawHighlight(ctx, markup) {
        ctx.fillStyle = markup.color;
        ctx.fillRect(
            markup.x,
            markup.y,
            markup.width,
            markup.height
        );
    }

    drawOutline(ctx, markup) {
        ctx.strokeStyle = markup.color;
        ctx.lineWidth = markup.width || 1;
        ctx.strokeRect(
            markup.x,
            markup.y,
            markup.width,
            markup.height
        );
    }

    drawBlowup(ctx, markup) {
        ctx.save();
        ctx.translate(markup.x, markup.y);
        ctx.rotate(markup.angle || 0);
        ctx.scale(markup.scale, markup.scale);

        ctx.fillStyle = markup.color;
        ctx.font = `${markup.fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(markup.text, 0, 0);
        ctx.restore();
    }

    drawRotate(ctx, markup) {
        ctx.save();
        ctx.translate(markup.x, markup.y);
        ctx.rotate(markup.angle);

        ctx.fillStyle = markup.color;
        ctx.font = `${markup.fontSize}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(markup.text, 0, 0);
        ctx.restore();
    }

    drawColorText(ctx, markup) {
        ctx.fillStyle = markup.color;
        ctx.font = `${markup.fontSize}px monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(markup.text, markup.x, markup.y);
    }

    /**
     * Draw silk trails from abdomen to touched words
     */
    drawSilkTrails(trails) {
        const ctx = this.ctx;

        trails.forEach(trail => {
            if (trail.age > 2.0) return; // Skip old trails

            const alpha = Math.max(0, 1 - trail.age / 2.0);
            if (alpha < 0.05) return;

            ctx.save();
            ctx.strokeStyle = `rgba(100, 100, 255, ${alpha * 0.3})`;
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(trail.from.x, trail.from.y);
            ctx.lineTo(trail.to.x, trail.to.y);
            ctx.stroke();
            ctx.restore();
        });
    }
}

// Export for use in other modules
window.SpiderDrawer = SpiderDrawer;