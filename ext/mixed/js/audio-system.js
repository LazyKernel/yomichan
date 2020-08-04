/*
 * Copyright (C) 2019-2020  Yomichan Authors
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
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

class TextToSpeechAudio {
    constructor(text, voice) {
        this.text = text;
        this.voice = voice;
        this._utterance = null;
        this._volume = 1;
    }

    get currentTime() {
        return 0;
    }
    set currentTime(value) {
        // NOP
    }

    get volume() {
        return this._volume;
    }
    set volume(value) {
        this._volume = value;
        if (this._utterance !== null) {
            this._utterance.volume = value;
        }
    }

    async play() {
        try {
            if (this._utterance === null) {
                this._utterance = new SpeechSynthesisUtterance(this.text || '');
                this._utterance.lang = 'ja-JP';
                this._utterance.volume = this._volume;
                this._utterance.voice = this.voice;
            }

            speechSynthesis.cancel();
            speechSynthesis.speak(this._utterance);
        } catch (e) {
            // NOP
        }
    }

    pause() {
        try {
            speechSynthesis.cancel();
        } catch (e) {
            // NOP
        }
    }
}

class AudioSystem {
    constructor({audioUriBuilder, requestBuilder=null, useCache}) {
        this._cache = useCache ? new Map() : null;
        this._cacheSizeMaximum = 32;
        this._audioUriBuilder = audioUriBuilder;
        this._requestBuilder = requestBuilder;

        if (typeof speechSynthesis !== 'undefined') {
            // speechSynthesis.getVoices() will not be populated unless some API call is made.
            speechSynthesis.addEventListener('voiceschanged', this._onVoicesChanged.bind(this));
        }
    }

    async getDefinitionAudio(definition, sources, details) {
        const key = `${definition.expression}:${definition.reading}`;
        const hasCache = (this._cache !== null && !details.disableCache);

        if (hasCache) {
            const cacheValue = this._cache.get(key);
            if (typeof cacheValue !== 'undefined') {
                const {audio, uri, source} = cacheValue;
                const index = sources.indexOf(source);
                if (index >= 0) {
                    return {audio, uri, index};
                }
            }
        }

        for (let i = 0, ii = sources.length; i < ii; ++i) {
            const source = sources[i];
            const uri = await this._getAudioUri(definition, source, details);
            if (uri === null) { continue; }

            try {
                const audio = (
                    details.binary ?
                    await this._createAudioBinary(uri) :
                    await this._createAudio(uri)
                );
                if (hasCache) {
                    this._cacheCheck();
                    this._cache.set(key, {audio, uri, source});
                }
                return {audio, uri, index: i};
            } catch (e) {
                // NOP
            }
        }

        throw new Error('Could not create audio');
    }

    createTextToSpeechAudio(text, voiceUri) {
        const voice = this._getTextToSpeechVoiceFromVoiceUri(voiceUri);
        if (voice === null) {
            throw new Error('Invalid text-to-speech voice');
        }
        return new TextToSpeechAudio(text, voice);
    }

    _onVoicesChanged() {
        // NOP
    }

    _getAudioUri(definition, source, details) {
        return (
            this._audioUriBuilder !== null ?
            this._audioUriBuilder.getUri(definition, source, details) :
            null
        );
    }

    async _createAudio(uri) {
        const ttsParameters = this._getTextToSpeechParameters(uri);
        if (ttsParameters !== null) {
            const {text, voiceUri} = ttsParameters;
            return this.createTextToSpeechAudio(text, voiceUri);
        }

        return await this._createAudioFromUrl(uri);
    }

    async _createAudioBinary(uri) {
        const ttsParameters = this._getTextToSpeechParameters(uri);
        if (ttsParameters !== null) {
            throw new Error('Cannot create audio from text-to-speech');
        }

        return await this._createAudioBinaryFromUrl(uri);
    }

    _createAudioFromUrl(url) {
        return new Promise((resolve, reject) => {
            const audio = new Audio(url);
            audio.addEventListener('loadeddata', () => {
                if (!this._isAudioValid(audio)) {
                    reject(new Error('Could not retrieve audio'));
                } else {
                    resolve(audio);
                }
            });
            audio.addEventListener('error', () => reject(audio.error));
        });
    }

    async _createAudioBinaryFromUrl(url) {
        const response = await this._requestBuilder.fetchAnonymous(url, {
            method: 'GET',
            mode: 'cors',
            cache: 'default',
            credentials: 'omit',
            redirect: 'follow',
            referrerPolicy: 'no-referrer'
        });
        const arrayBuffer = await response.arrayBuffer();

        if (!await this._isAudioBinaryValid(arrayBuffer)) {
            throw new Error('Could not retrieve audio');
        }

        return arrayBuffer;
    }

    _isAudioValid(audio) {
        const duration = audio.duration;
        return (
            duration !== 5.694694 && // jpod101 invalid audio (Chrome)
            duration !== 5.720718 // jpod101 invalid audio (Firefox)
        );
    }

    async _isAudioBinaryValid(arrayBuffer) {
        const digest = await AudioSystem.arrayBufferDigest(arrayBuffer);
        switch (digest) {
            case 'ae6398b5a27bc8c0a771df6c907ade794be15518174773c58c7c7ddd17098906': // jpod101 invalid audio
                return false;
            default:
                return true;
        }
    }

    _getTextToSpeechVoiceFromVoiceUri(voiceUri) {
        try {
            for (const voice of speechSynthesis.getVoices()) {
                if (voice.voiceURI === voiceUri) {
                    return voice;
                }
            }
        } catch (e) {
            // NOP
        }
        return null;
    }

    _getTextToSpeechParameters(uri) {
        const m = /^tts:[^#?]*\?([^#]*)/.exec(uri);
        if (m === null) { return null; }

        const searchParameters = new URLSearchParams(m[1]);
        const text = searchParameters.get('text');
        const voiceUri = searchParameters.get('voice');
        return (text !== null && voiceUri !== null ? {text, voiceUri} : null);
    }

    _cacheCheck() {
        const removeCount = this._cache.size - this._cacheSizeMaximum;
        if (removeCount <= 0) { return; }

        const removeKeys = [];
        for (const key of this._cache.keys()) {
            removeKeys.push(key);
            if (removeKeys.length >= removeCount) { break; }
        }

        for (const key of removeKeys) {
            this._cache.delete(key);
        }
    }

    static async arrayBufferDigest(arrayBuffer) {
        const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(arrayBuffer)));
        let digest = '';
        for (const byte of hash) {
            digest += byte.toString(16).padStart(2, '0');
        }
        return digest;
    }
}
