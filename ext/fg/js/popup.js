/*
 * Copyright (C) 2016-2017  Alex Yatskov <alex@foosoft.net>
 * Author: Alex Yatskov <alex@foosoft.net>
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */


class Popup {
    constructor(id, depth, frameIdPromise) {
        this.id = id;
        this.depth = depth;
        this.frameIdPromise = frameIdPromise;
        this.frameId = null;
        this.parent = null;
        this.child = null;
        this.container = document.createElement('iframe');
        this.container.id = 'yomichan-float';
        this.container.addEventListener('mousedown', e => e.stopPropagation());
        this.container.addEventListener('scroll', e => e.stopPropagation());
        this.container.setAttribute('src', chrome.extension.getURL('/fg/float.html'));
        this.container.style.width = '0px';
        this.container.style.height = '0px';
        this.injectPromise = null;
        this.isInjected = false;
        this.visible = false;
        this.visibleOverride = null;
        this.updateVisibility();
    }

    inject(options) {
        if (this.injectPromise === null) {
            this.injectPromise = this.createInjectPromise(options);
        }
        return this.injectPromise;
    }

    async createInjectPromise(options) {
        try {
            const {frameId} = await this.frameIdPromise;
            if (typeof frameId === 'number') {
                this.frameId = frameId;
            }
        } catch (e) {
            // NOP
        }

        return new Promise((resolve) => {
            const parentFrameId = (typeof this.frameId === 'number' ? this.frameId : null);
            this.container.addEventListener('load', () => {
                this.invokeApi('initialize', {
                    options: {
                        general: {
                            customPopupCss: options.general.customPopupCss
                        }
                    },
                    popupInfo: {
                        id: this.id,
                        depth: this.depth,
                        parentFrameId
                    },
                    url: this.url
                });
                resolve();
            });
            this.observeFullscreen();
            this.onFullscreenChanged();
            this.isInjected = true;
        });
    }

    async show(elementRect, writingMode, options) {
        await this.inject(options);

        const optionsGeneral = options.general;
        const container = this.container;
        const containerRect = container.getBoundingClientRect();
        const getPosition = (
            writingMode === 'horizontal-tb' || optionsGeneral.popupVerticalTextPosition === 'default' ?
            Popup.getPositionForHorizontalText :
            Popup.getPositionForVerticalText
        );

        const [x, y, width, height, below] = getPosition(
            elementRect,
            Math.max(containerRect.width, optionsGeneral.popupWidth),
            Math.max(containerRect.height, optionsGeneral.popupHeight),
            document.body.clientWidth,
            window.innerHeight,
            optionsGeneral,
            writingMode
        );

        container.classList.toggle('yomichan-float-full-width', optionsGeneral.popupDisplayMode === 'full-width');
        container.classList.toggle('yomichan-float-above', !below);
        container.style.left = `${x}px`;
        container.style.top = `${y}px`;
        container.style.width = `${width}px`;
        container.style.height = `${height}px`;

        this.setVisible(true);
        if (this.child !== null) {
            this.child.hide(true);
        }
    }

    static getPositionForHorizontalText(elementRect, width, height, maxWidth, maxHeight, optionsGeneral) {
        let x = elementRect.left + optionsGeneral.popupHorizontalOffset;
        const overflowX = Math.max(x + width - maxWidth, 0);
        if (overflowX > 0) {
            if (x >= overflowX) {
                x -= overflowX;
            } else {
                width = maxWidth;
                x = 0;
            }
        }

        const preferBelow = (optionsGeneral.popupHorizontalTextPosition === 'below');

        const verticalOffset = optionsGeneral.popupVerticalOffset;
        const [y, h, below] = Popup.limitGeometry(
            elementRect.top - verticalOffset,
            elementRect.bottom + verticalOffset,
            height,
            maxHeight,
            preferBelow
        );

        return [x, y, width, h, below];
    }

    static getPositionForVerticalText(elementRect, width, height, maxWidth, maxHeight, optionsGeneral, writingMode) {
        const preferRight = Popup.isVerticalTextPopupOnRight(optionsGeneral.popupVerticalTextPosition, writingMode);
        const horizontalOffset = optionsGeneral.popupHorizontalOffset2;
        const verticalOffset = optionsGeneral.popupVerticalOffset2;

        const [x, w] = Popup.limitGeometry(
            elementRect.left - horizontalOffset,
            elementRect.right + horizontalOffset,
            width,
            maxWidth,
            preferRight
        );
        const [y, h, below] = Popup.limitGeometry(
            elementRect.bottom - verticalOffset,
            elementRect.top + verticalOffset,
            height,
            maxHeight,
            true
        );
        return [x, y, w, h, below];
    }

    static isVerticalTextPopupOnRight(positionPreference, writingMode) {
        switch (positionPreference) {
            case 'before':
                return !Popup.isWritingModeLeftToRight(writingMode);
            case 'after':
                return Popup.isWritingModeLeftToRight(writingMode);
            case 'left':
                return false;
            case 'right':
                return true;
        }
    }

    static isWritingModeLeftToRight(writingMode) {
        switch (writingMode) {
            case 'vertical-lr':
            case 'sideways-lr':
                return true;
            default:
                return false;
        }
    }

    static limitGeometry(positionBefore, positionAfter, size, limit, preferAfter) {
        let after = preferAfter;
        let position = 0;
        const overflowBefore = Math.max(0, size - positionBefore);
        const overflowAfter = Math.max(0, positionAfter + size - limit);
        if (overflowAfter > 0 || overflowBefore > 0) {
            if (overflowAfter < overflowBefore) {
                size = Math.max(0, size - overflowAfter);
                position = positionAfter;
                after = true;
            } else {
                size = Math.max(0, size - overflowBefore);
                position = Math.max(0, positionBefore - size);
                after = false;
            }
        } else {
            position = preferAfter ? positionAfter : positionBefore - size;
        }

        return [position, size, after];
    }

    async showOrphaned(elementRect, writingMode, options) {
        await this.show(elementRect, writingMode, options);
        this.invokeApi('orphaned');
    }

    hide(changeFocus) {
        if (!this.isVisible()) {
            return;
        }

        this.setVisible(false);
        if (this.child !== null) {
            this.child.hide(false);
        }
        if (changeFocus) {
            this.focusParent();
        }
    }

    isVisible() {
        return this.isInjected && (this.visibleOverride !== null ? this.visibleOverride : this.visible);
    }

    setVisible(visible) {
        this.visible = visible;
        this.updateVisibility();
    }

    setVisibleOverride(visible) {
        this.visibleOverride = visible;
        this.updateVisibility();
    }

    updateVisibility() {
        this.container.style.setProperty('visibility', this.isVisible() ? 'visible' : 'hidden', 'important');
    }

    focusParent() {
        if (this.parent !== null) {
            // Chrome doesn't like focusing iframe without contentWindow.
            const contentWindow = this.parent.container.contentWindow;
            if (contentWindow !== null) {
                contentWindow.focus();
            }
        } else {
            // Firefox doesn't like focusing window without first blurring the iframe.
            // this.container.contentWindow.blur() doesn't work on Firefox for some reason.
            this.container.blur();
            // This is needed for Chrome.
            window.focus();
        }
    }

    async containsPoint(x, y) {
        for (let popup = this; popup !== null && popup.isVisible(); popup = popup.child) {
            const rect = popup.container.getBoundingClientRect();
            if (x >= rect.left && y >= rect.top && x < rect.right && y < rect.bottom) {
                return true;
            }
        }
        return false;
    }

    async termsShow(elementRect, writingMode, definitions, options, context) {
        await this.show(elementRect, writingMode, options);
        this.invokeApi('termsShow', {definitions, options, context});
    }

    async kanjiShow(elementRect, writingMode, definitions, options, context) {
        await this.show(elementRect, writingMode, options);
        this.invokeApi('kanjiShow', {definitions, options, context});
    }

    clearAutoPlayTimer() {
        if (this.isInjected) {
            this.invokeApi('clearAutoPlayTimer');
        }
    }

    invokeApi(action, params={}) {
        this.container.contentWindow.postMessage({action, params}, '*');
    }

    observeFullscreen() {
        const fullscreenEvents = [
            'fullscreenchange',
            'MSFullscreenChange',
            'mozfullscreenchange',
            'webkitfullscreenchange'
        ];
        for (const eventName of fullscreenEvents) {
            document.addEventListener(eventName, () => this.onFullscreenChanged(), false);
        }
    }

    getFullscreenElement() {
        return (
            document.fullscreenElement ||
            document.msFullscreenElement ||
            document.mozFullScreenElement ||
            document.webkitFullscreenElement
        );
    }

    onFullscreenChanged() {
        const parent = (this.getFullscreenElement() || document.body || null);
        if (parent !== null && this.container.parentNode !== parent) {
            parent.appendChild(this.container);
        }
    }

    get url() {
        return window.location.href;
    }
}
