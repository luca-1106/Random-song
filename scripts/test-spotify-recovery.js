/* Run with: node scripts/test-spotify-recovery.js
   Executes the actual application sources against simulated browser/Spotify responses.
   No Spotify credentials, network calls or dependencies are needed. */
const fs=require('node:fs');
const path=require('node:path');
const files=Object.fromEntries(['spotify.js','app.js','session.js','index.html','session.html'].map(p=>[p,fs.readFileSync(path.join(__dirname,'..',p),'utf8')]));
async function suite(files) {
  const results=[];
  const equal=(a,b,msg)=>{if(a!==b)throw Error(msg+` (expected ${b}, got ${a})`);};
  const ok=(v,msg)=>{if(!v)throw Error(msg);};
  const rejects=async(p,code)=>{try{await p;}catch(e){equal(e.code,code,"error classification");return e;}throw Error("Expected rejection "+code);};
  const test=async(name,fn)=>{try{await fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:String(e.stack||e)});}};
  const prefix="muziekmix.spotify.";
  const historyKey="muziekmix.playedHistory.v1",recentKey="muziekmix.recentPlaybackHistory.v1";
  const oldClient="a".repeat(32),newClient="b".repeat(32);
  const scope="streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state";
  const store=(seed={})=>{
    const m=new Map(Object.entries(seed).map(([k,v])=>[k,String(v)]));
    return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k),dump:()=>Object.fromEntries(m)};
  };
  class Params {
    constructor(v=""){this.values=new Map(typeof v==="string"?v.replace(/^\?/,"").split("&").filter(Boolean).map(x=>{const i=x.indexOf("=");return [decodeURIComponent(i<0?x:x.slice(0,i)),decodeURIComponent(i<0?"":x.slice(i+1).replace(/\+/g," "))];}):Object.entries(v).map(([k,v])=>[k,String(v)]));}
    get(k){return this.values.get(k)??null;}
    has(k){return this.values.has(k);}
    toString(){return [...this.values].map(([k,v])=>encodeURIComponent(k)+"="+encodeURIComponent(v)).join("&");}
  }
  const response=(status,data={})=>({status,ok:status>=200&&status<300,json:async()=>data,headers:{get:()=>null}});
  const flush=async()=>{for(let i=0;i<80;i++)await Promise.resolve();};
  function auth(options={}){
    const localStorage=store({
      [prefix+"authVersion"]:"3",[prefix+"access"]:"old-access",[prefix+"refresh"]:"old-refresh",
      [prefix+"expiry"]:Date.now()+(options.expired?-1000:3600000),[prefix+"sessionClientId"]:oldClient,
      [prefix+"scope"]:options.legacy?"streaming user-read-private":scope,
      [historyKey]:'["old-song"]',[recentKey]:'["old-song","old-song"]',...options.seed
    });
    const sessionStorage=store(),calls=[],queue=[];
    const loc={origin:"https://example.test",pathname:"/Random-song/",search:"",href:"",assign(url){this.href=url;}};
    const window={APP_CONFIG:{spotifyClientId:oldClient,spotifyAuthVersion:3,spotifyRedirectUri:"https://example.test/Random-song/"},location:loc};
    let rand=0;
    const env={window,localStorage,sessionStorage,location:loc,document:{title:"test"},history:{replaceState(){loc.search="";}},URLSearchParams:Params,AbortController:class{constructor(){this.signal={};}abort(){}},crypto:{getRandomValues(a){for(let i=0;i<a.length;i++)a[i]=++rand%256;return a;},subtle:{digest:async()=>new Uint8Array(32)}},TextEncoder:class{encode(s){return Uint8Array.from(s,c=>c.charCodeAt(0));}},btoa:s=>Array.from(s,c=>String.fromCharCode(65+(c.charCodeAt(0)%26))).join(""),setTimeout:()=>1,clearTimeout:()=>{},fetch:async(url,opts)=>{calls.push({url,opts});if(!queue.length)throw Error("Unexpected request "+url);const item=queue.shift();if(typeof item==="function")return item(url,opts);if(item instanceof Error)throw item;return item;}};
    new Function(...Object.keys(env),files["spotify.js"])(...Object.values(env));
    return {api:window.SpotifyApp,localStorage,sessionStorage,loc,calls,queue,window,historyIntact(){equal(localStorage.getItem(historyKey),'["old-song"]',"unique history");equal(localStorage.getItem(recentKey),'["old-song","old-song"]',"recent history");}};
  }
  await test("Player 403 + valid profile preserves login",async()=>{
    const h=auth();h.queue.push(response(403,{error:{reason:"PREMIUM_REQUIRED",message:"Restriction"}}),response(200,{id:"user"}));
    await rejects(h.api.request("/me/player/play?device_id=x","PUT",{uris:["x"]}),"SPOTIFY_PLAYBACK_FORBIDDEN");
    ok(h.api.hasSession(),"login lost");equal(h.api.connectionIssue(),"","wrong recovery");equal(h.calls.length,2,"profile recheck");h.historyIntact();
  });
  await test("Search 403 + revoked profile invalidates only authorization",async()=>{
    const h=auth();h.queue.push(response(403),response(403));
    await rejects(h.api.request("/search"),"SPOTIFY_ACCESS_INVALID");
    ok(!h.api.hasSession(),"revoked token retained");equal(h.api.connectionIssue(),"access","persistent recovery");h.historyIntact();
  });
  await test("Playback 403 + temporary profile failure retains login",async()=>{
    const h=auth();h.queue.push(response(403),response(503));
    await rejects(h.api.request("/me/player/play","PUT"),"SPOTIFY_TEMPORARY");
    ok(h.api.hasSession(),"login lost");equal(h.api.connectionIssue(),"","false recovery");h.historyIntact();
  });
  for(const status of [429,500,503]){
    await test("Refresh HTTP "+status+" preserves tokens",async()=>{
      const h=auth({expired:true});h.queue.push(response(status,{error:"server_error"}));
      await rejects(h.api.token(),"SPOTIFY_TEMPORARY");equal(h.localStorage.getItem(prefix+"refresh"),"old-refresh","refresh removed");equal(h.api.connectionIssue(),"","false recovery");h.historyIntact();
    });
  }
  await test("Refresh network error preserves tokens",async()=>{
    const h=auth({expired:true});h.queue.push(new TypeError("network"));
    await rejects(h.api.token(),"SPOTIFY_TEMPORARY");ok(h.api.hasSession(),"login lost");h.historyIntact();
  });
  await test("invalid_grant requires new login",async()=>{
    const h=auth({expired:true});h.queue.push(response(400,{error:"invalid_grant"}));
    await rejects(h.api.token(),"SPOTIFY_SESSION_EXPIRED");ok(!h.api.hasSession(),"expired session retained");equal(h.api.connectionIssue(),"expired","reason not persisted");h.historyIntact();
  });
  await test("Concurrent refresh uses one request and preserves omitted refresh token",async()=>{
    const h=auth({expired:true});h.queue.push(response(200,{access_token:"fresh",expires_in:3600}));
    const out=await Promise.all([h.api.token(),h.api.token()]);equal(out.join(","),"fresh,fresh","refresh results");equal(h.calls.length,1,"duplicate refresh");equal(h.localStorage.getItem(prefix+"refresh"),"old-refresh","refresh lost");
  });
  await test("401 refresh and single retry",async()=>{
    const h=auth();h.queue.push(response(401),response(200,{access_token:"fresh",expires_in:3600}),response(200,{id:"user"}));
    equal((await h.api.profile()).id,"user","profile");equal(h.calls.length,3,"wrong retries");equal(h.calls[2].opts.headers.Authorization,"Bearer fresh","stale token");
  });
  await test("Second 401 persists expiry",async()=>{
    const h=auth();h.queue.push(response(401),response(200,{access_token:"fresh"}),response(401));
    await rejects(h.api.profile(),"SPOTIFY_SESSION_EXPIRED");ok(!h.api.hasSession(),"invalid session kept");h.historyIntact();
  });
  await test("Device 404 differs from track 404",async()=>{
    const h=auth();h.queue.push(response(404),response(404));await rejects(h.api.request("/me/player/play","PUT"),"SPOTIFY_DEVICE_UNAVAILABLE");await rejects(h.api.request("/tracks/abc"),"TRACK_NOT_FOUND");ok(h.api.hasSession(),"login lost");
  });
  async function begin(h,source="own",clientId=newClient){
    await h.api.login({source,clientId});
    const p=new Params(h.loc.href.split("?")[1]);
    ok(p.get("scope").split(" ").includes("user-read-email"),"SDK permission absent");
    equal(p.get("show_dialog"),"true","consent not forced");
    equal(p.get("code_challenge_method"),"S256","wrong PKCE");
    return p.get("state");
  }
  await test("Legacy scope requires confirmation but preserves session",async()=>{
    const h=auth({legacy:true});ok(!h.api.hasRequiredScopes(),"legacy incorrectly valid");ok(h.api.hasSession(),"legacy login erased");
  });
  await test("Cancelled developer switch keeps original connection",async()=>{
    const h=auth(),state=await begin(h);
    equal(h.api.currentClientId(),oldClient,"switch committed before authorization");
    h.loc.search="?error=access_denied&state="+state;
    await rejects(h.api.handleCallback(),"SPOTIFY_CALLBACK");
    equal(h.api.currentClientId(),oldClient,"cancel changed source");equal(h.localStorage.getItem(prefix+"access"),"old-access","old login erased");h.historyIntact();
  });
  await test("New account denied by allowlist keeps original login",async()=>{
    const h=auth(),state=await begin(h,"shared");
    h.loc.search="?code=abc&state="+state;h.queue.push(response(200,{access_token:"new",refresh_token:"new-refresh",scope}),response(403));
    await rejects(h.api.handleCallback(),"SPOTIFY_CALLBACK");
    equal(h.api.currentClientId(),oldClient,"failed new source committed");equal(h.localStorage.getItem(prefix+"access"),"old-access","old login erased");h.historyIntact();
  });
  await test("Successful switch validates new profile then commits",async()=>{
    const h=auth(),state=await begin(h,"shared");
    h.loc.search="?code=abc&state="+state;h.queue.push(response(200,{access_token:"new",refresh_token:"new-refresh",scope}),response(200,{id:"new-user"}));
    equal((await h.api.handleCallback()).id,"new-user","callback profile");
    equal(h.api.currentClientId(),newClient,"wrong client");equal(h.api.clientSource(),"shared","wrong source");ok(h.api.hasRequiredScopes(),"new scopes missing");equal(h.localStorage.getItem(prefix+"refresh"),"new-refresh","wrong refresh");h.historyIntact();
  });
  await test("Invalid state blocks code exchange",async()=>{
    const h=auth();await begin(h);h.loc.search="?code=abc&state=wrong";await rejects(h.api.handleCallback(),"SPOTIFY_CALLBACK");equal(h.calls.length,0,"unverified code exchanged");h.historyIntact();
  });
  await test("Incomplete consent does not replace valid session",async()=>{
    const h=auth(),state=await begin(h);h.loc.search="?code=abc&state="+state;h.queue.push(response(200,{access_token:"new",refresh_token:"new-refresh",scope:"streaming"}),response(200,{id:"user"}));await rejects(h.api.handleCallback(),"SPOTIFY_CALLBACK");equal(h.localStorage.getItem(prefix+"access"),"old-access","old login lost");
  });
  await test("Logout does not let a late refresh resurrect old credentials",async()=>{
    const h=auth({expired:true});let resolve;h.queue.push(()=>new Promise(r=>resolve=r));
    const refresh=h.api.token();await flush();h.api.clear();resolve(response(200,{access_token:"new"}));await rejects(refresh,"SPOTIFY_TEMPORARY");ok(!h.api.hasSession(),"logout undone");equal(h.api.connectionIssue(),"","logout produced recovery");h.historyIntact();
  });
  await test("Stale API response after another tab switches login is ignored",async()=>{
    const h=auth();let resolve;h.queue.push(()=>new Promise(r=>resolve=r));
    const request=h.api.profile();await flush();
    h.localStorage.setItem(prefix+"revision","other-tab");h.localStorage.setItem(prefix+"access","new-access");
    resolve(response(403));await rejects(request,"SPOTIFY_TEMPORARY");equal(h.localStorage.getItem(prefix+"access"),"new-access","new login erased");
  });
  function dom(html){
    const elements=new Map();
    function node(selector,tag=""){
      const attrs=new Map(),classes=new Set(),handlers=new Map();
      const el={value:"",textContent:"",innerHTML:"",hidden:/\bhidden\b/.test(tag),disabled:/\bdisabled\b/.test(tag),open:false,style:{},dataset:{},
        classList:{toggle:(c,on)=>{if(on===undefined)on=!classes.has(c);on?classes.add(c):classes.delete(c);return on;},add:c=>classes.add(c),remove:c=>classes.delete(c),contains:c=>classes.has(c)},
        setAttribute:(k,v)=>attrs.set(k,String(v)),getAttribute:k=>attrs.get(k),removeAttribute:k=>attrs.delete(k),
        addEventListener:(k,fn)=>{const a=handlers.get(k)||[];a.push(fn);handlers.set(k,a);},removeEventListener:(k,fn)=>handlers.set(k,(handlers.get(k)||[]).filter(f=>f!==fn)),
        fire(k="click"){return Promise.all((handlers.get(k)||[]).map(fn=>fn({target:el,preventDefault(){}})));},
        showModal(){this.open=true;},close(){this.open=false;},querySelector(){return null;},closest(){return null;}
      };
      elements.set(selector,el);return el;
    }
    for(const m of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g))node("#"+m[1],m[0]);
    for(const name of ["player-card","progress-track","back-button"])if(html.includes(name))node("."+name);
    const document={querySelector:s=>elements.get(s)||null,querySelectorAll:()=>[],addEventListener(){},createElement:()=>node("script"),head:{appendChild(){}}};
    return {document,elements,$:s=>{const el=elements.get(s);if(!el)throw Error("Missing element "+s);return el;}};
  }
  function session({stall=false,genres=["rock"]}={}){
    const ui=dom(files["session.html"]),localStorage=store(),sessionStorage=store({"muziekmix.session.genres":'["rock"]'});
    let currentSdk=null,failPlay=false,blockReady=stall,redirect="",playState=null;
    const calls=[],instances=[];
    const tracks=[1,2,3].map(n=>({title:"Song "+n,artist:"Artist",year:2000,genres,spotifyUri:"spotify:track:track"+n}));
    const window={TRACKS:tracks,location:{replace:u=>redirect=u,assign:u=>redirect=u},SpotifyApp:{hasSession:()=>true,hasRequiredScopes:()=>true,profile:async()=>({id:"user"}),token:async()=>"token",request:async(path,method,body)=>{
      if(path.startsWith("/tracks/"))return {uri:"spotify:track:"+path.split("/").pop(),name:"Song",artists:[{name:"Artist"}],album:{id:"album",images:[]},duration_ms:180000};
      if(path.startsWith("/me/player/play")){
        calls.push(body.uris[0]);if(failPlay){failPlay=false;throw Object.assign(Error("Playback restricted"),{code:"SPOTIFY_PLAYBACK_FORBIDDEN"});}
        playState={paused:false,position:0,duration:180000,track_window:{current_track:{uri:body.uris[0]}}};
        currentSdk.emit("player_state_changed",playState);return null;
      }
      throw Error("Unexpected session call "+path);
    }},Spotify:{Player:class {
      constructor(){this.handlers={};currentSdk=this;instances.push(this);}
      addListener(k,fn){this.handlers[k]=fn;}
      emit(k,v){this.handlers[k]?.(v);}
      async connect(){if(!blockReady)this.emit("ready",{device_id:"device-"+instances.length});return true;}
      disconnect(){this.disconnected=true;}
      async activateElement(){}
      async getCurrentState(){return playState;}
      async pause(){if(playState){playState={...playState,paused:true};this.emit("player_state_changed",playState);}}
      async resume(){if(playState){playState={...playState,paused:false};this.emit("player_state_changed",playState);}}
    }}};
    const env={...ui,window,localStorage,sessionStorage,document:ui.document,setTimeout:(fn,ms)=>{const h={active:true};if(ms===18000&&blockReady||ms<1000)Promise.resolve().then(()=>{if(h.active)fn();});return h;},clearTimeout:h=>{if(h)h.active=false;},setInterval:()=>1,clearInterval:()=>{}};
    new Function(...Object.keys(env),files["session.js"])(...Object.values(env));
    return {...ui,localStorage,sessionStorage,calls,instances,failNext(){failPlay=true;},unblock(){blockReady=false;},sdk:()=>currentSdk,redirect:()=>redirect,played:()=>JSON.parse(localStorage.getItem(historyKey)||"[]"),recent:()=>JSON.parse(localStorage.getItem(recentKey)||"[]")};
  }
  await test("Player init, failed play retries same song, double-next, reconnect and history",async()=>{
    const h=session();await flush();
    ok(!h.$("#startPlayback").disabled,"player did not initialize");
    h.failNext();await h.$("#startPlayback").fire();await flush();
    equal(h.played().length,0,"failed play recorded");equal(h.calls.length,1,"unexpected play count");ok(!h.$("#startPlayback").disabled,"failed play button blocked");
    await h.$("#startPlayback").fire();await flush();equal(h.calls[0],h.calls[1],"retry skipped song");equal(h.played().length,1,"first play not counted");equal(h.recent().length,1,"first recent event incorrect");
    const a=h.$("#nextButton").fire(),b=h.$("#nextButton").fire();await Promise.all([a,b]);await flush();equal(h.calls.length,3,"double click skipped");equal(h.played().length,2,"history count wrong");
    const last=h.calls.at(-1);h.sdk().emit("not_ready");await flush();ok(h.$("#nextButton").disabled,"disconnected next allowed");ok(!h.$("#retryPlayer").hidden,"retry missing");
    await h.$("#retryPlayer").fire();await flush();equal(h.instances.length,2,"player not replaced");ok(!h.$("#pauseButton").disabled,"resume unavailable");
    await h.$("#pauseButton").fire();await flush();equal(h.calls.at(-1),last,"resume changed song");equal(h.played().length,2,"resume changed unique history");equal(h.recent().length,2,"resume counted as new song");
  });
  await test("Track genres stay hidden until reveal and reset on next track",async()=>{
    for(const [genres,expected] of [
      [["rock"],"Genre: Rock"],
      [["rock","pop","rock","alles","unknown"],"Genres: Pop · Rock"]
    ]){
      const h=session({genres});await flush();
      const label=h.$("#trackGenres");
      ok(label.hidden,"genre visible before first playback");
      await h.$("#startPlayback").fire();await flush();
      ok(label.hidden,"genre visible before reveal");
      equal(label.textContent,expected,"wrong catalog genres");
      await h.$("#revealButton").fire();await flush();
      ok(!label.hidden,"genre missing after reveal");
      await h.$("#nextButton").fire();await flush();
      ok(label.hidden,"genre visible on next concealed track");
      await h.$("#revealButton").fire();await flush();
      equal(label.textContent,expected,"next genre incorrect");ok(!label.hidden,"next genre not revealed");
      ok(!h.elements.has("#spotifyTrackLink"),"obsolete link remains");
    }
  });
  await test("Player initialization timeout is recoverable",async()=>{
    const h=session({stall:true});await flush();ok(!h.$("#retryPlayer").hidden,"timeout missing retry");ok(h.$("#startPlayback").disabled,"unready play enabled");ok(h.instances[0].disconnected,"stalled player not disconnected");
    h.unblock();await h.$("#retryPlayer").fire();await flush();ok(!h.$("#startPlayback").disabled,"retry failed");equal(h.instances.length,2,"retry didn't create new player");
  });
  await test("All static JS and referenced HTML IDs are valid",async()=>{
    for(const [js,html] of [["app.js","index.html"],["session.js","session.html"]]){
      new Function(files[js]);const ids=[...files[html].matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);equal(ids.length,new Set(ids).size,"Duplicate IDs");for(const m of files[js].matchAll(/\$\(['"]#([^'"]+)['"]\)/g))ok(ids.includes(m[1]),"Missing HTML ID "+m[1]);
    }new Function(files["spotify.js"]);
  });
  return results;
}
suite(files).then(results=>{for(const r of results)console.log((r.pass?'PASS ':'FAIL ')+r.name+(r.error?'\n'+r.error:''));console.log(results.filter(r=>r.pass).length+'/'+results.length+' passed');if(results.some(r=>!r.pass))process.exitCode=1;}).catch(e=>{console.error(e);process.exitCode=1;});
