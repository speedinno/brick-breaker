// Short synthesized effects are bundled/offline. The context must be resumed
// by a user gesture before scheduling a tone in Android/iOS WebViews.
export class SoundEffects {
  constructor({enabled=false,createContext=()=>new(globalThis.AudioContext||globalThis.webkitAudioContext)()}={}){this.enabled=enabled;this.createContext=createContext;this.context=null;this.unlockTask=null;this.error=null;this.mutes=new Set();this.voices=new Set();}
  mute(reason){this.mutes.add(reason);for(const voice of this.voices){try{voice.stop();}catch{}}}
  unmute(reason){this.mutes.delete(reason);}
  async unlock(){
    if(!this.enabled)return false;if(this.unlockTask)return this.unlockTask;
    this.unlockTask=(async()=>{try{if(!this.context||this.context.state==='closed')this.context=this.createContext();if(this.context.state!=='running')await this.context.resume();if(this.context.state!=='running')throw Error('Audio is paused');this.error=null;return true;}catch{this.error=Error('Sound could not start. Tap the switch to try again and check your phone’s media volume.');return false;}})();
    try{return await this.unlockTask;}finally{this.unlockTask=null;}
  }
  play(frequency=500,duration=.05){
    if(!this.enabled||this.mutes.size||this.context?.state!=='running')return false;
    try{const audio=this.context,time=audio.currentTime,osc=audio.createOscillator(),gain=audio.createGain();osc.frequency.setValueAtTime(frequency,time);gain.gain.setValueAtTime(.001,time);gain.gain.linearRampToValueAtTime(.07,time+.005);gain.gain.exponentialRampToValueAtTime(.001,time+duration);osc.connect(gain);gain.connect(audio.destination);this.voices.add(osc);osc.onended=()=>{this.voices.delete(osc);osc.disconnect();gain.disconnect();};osc.start(time);osc.stop(time+duration);return true;}catch{this.error=Error('Sound could not play. Tap the switch to try again.');return false;}
  }
}
