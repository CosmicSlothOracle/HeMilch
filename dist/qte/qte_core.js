// QTE core module
(function(){
  // Simple QTE trigger for browser environments
  // sequence: {id, timeout, steps:[{time,key,window:[start,end],weight}]}
  // opts: {onUpdate, onStepHit, onStepMiss, onFinished, inputManager}

  function nowSeconds(){return performance.now()/1000}

  function triggerQTE(sequence, opts){
    opts = opts||{};
    const startTime = nowSeconds();
    const steps = sequence.steps.map(s=>Object.assign({},s,{status:'pending'}));
    let resolved = false;

    const stateForRender = ()=>({
      id: sequence.id,
      steps: steps.map(s=>({key:s.key, status:s.status}))
    });

    function cleanup(){
      window.removeEventListener('keydown', keyHandler);
      if(timer) clearTimeout(timer);
    }

    function finish(){
      if(resolved) return;
      resolved = true;
      cleanup();
      const score = steps.reduce((acc,s)=> acc + ((s.status==='hit')? (s.weight||1):0),0);
      const success = steps.every(s=>s.status==='hit');
      const result = { success, score, details: steps.map(s=>({key:s.key,status:s.status,time:s.time})) };
      if(opts.onFinished) try{opts.onFinished(result)}catch(e){}
      if(opts.onUpdate) try{opts.onUpdate(null)}catch(e){}
      return resolvePromise(result);
    }

    // Promise resolver helpers
    let resolvePromise;
    const p = new Promise(resolve=>{ resolvePromise = resolve });

    // Key handler
    function keyHandler(e){
      const t = nowSeconds() - startTime;
      // find first pending step that matches key and is within its window
      for(const s of steps){
        if(s.status !== 'pending') continue;
        if(e.code !== s.key) continue;
        const windowStart = (s.time + (s.window? s.window[0]:0));
        const windowEnd = (s.time + (s.window? s.window[1]:0));
        if(t >= windowStart && t <= windowEnd){
          s.status = 'hit';
          if(opts.onStepHit) try{opts.onStepHit(s)}catch(e){}
          if(opts.onUpdate) try{opts.onUpdate(stateForRender())}catch(e){}
          return;
        }
      }
    }

    // Mark misses when their window passes
    function checkMisses(){
      const t = nowSeconds() - startTime;
      let changed = false;
      for(const s of steps){
        if(s.status !== 'pending') continue;
        const windowEnd = (s.time + (s.window? s.window[1]:0));
        if(t > windowEnd){
          s.status = 'miss';
          changed = true;
          if(opts.onStepMiss) try{opts.onStepMiss(s)}catch(e){}
        }
      }
      if(changed && opts.onUpdate) try{opts.onUpdate(stateForRender())}catch(e){}
    }

    // Start listening
    window.addEventListener('keydown', keyHandler);
    if(opts.onUpdate) try{opts.onUpdate(stateForRender())}catch(e){}

    // Poll for misses and completion
    const pollInterval = 50; // ms
    let pollTimer = setInterval(()=>{
      checkMisses();
      const allDone = steps.every(s=>s.status!=='pending');
      if(allDone) { clearInterval(pollTimer); finish(); }
    }, pollInterval);

    // Safety timeout
    const totalTimeout = sequence.timeout || ( (sequence.steps.length? (sequence.steps[sequence.steps.length-1].time + (sequence.steps[sequence.steps.length-1].window? sequence.steps[sequence.steps.length-1].window[1]:0) + 0.5) : 3) );
    const timer = setTimeout(()=>{ clearInterval(pollTimer); checkMisses(); finish() }, totalTimeout*1000 + 200);

    return p;
  }

  // Expose
  window.QTE = window.QTE || {};
  window.QTE.triggerQTE = triggerQTE;
})();
