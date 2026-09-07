(function(){
  var resourceData = null;

  function getValue(id){var el=document.getElementById(id);return el?el.value:'';}
  function num(id){var v=Number(getValue(id));return Number.isFinite(v)?v:0;}
  function key(name){return String(name||'').replace(/\s+/g,'').replace(/[^A-Za-z]/g,'');}

  var points={Galveston:[29.3013,-94.7977],Harris:[29.7604,-95.3698],Montgomery:[30.3213,-95.4778],Walker:[30.7235,-95.5508],Madison:[30.9499,-95.9116],Dallas:[32.7767,-96.7970],Tarrant:[32.7555,-97.3308],Bexar:[29.4241,-98.4936],Travis:[30.2672,-97.7431],Collin:[33.1795,-96.4930],Denton:[33.2148,-97.1331],FortBend:[29.5693,-95.8143],Hidalgo:[26.1004,-98.2631],ElPaso:[31.7619,-106.4850],Brazoria:[29.1694,-95.4344]};

  function pathPoints(){
    return getValue('trackCounties').split(',').map(function(c){
      var p=points[key(c.trim())];
      return p?{lat:p[0],lng:p[1]}:null;
    }).filter(Boolean);
  }

  function runFullPipeline(){
    if(!window.TXDRStormPathCountyMapper||!window.TXDRRunScenarioPipeline)return;
    var impacts=window.TXDRStormPathCountyMapper.mapStormPathToCountyImpacts({
      pathPoints:pathPoints(),
      countyPoints:points,
      wind:num('windSpeed'),
      rain:num('rainfall'),
      duration:num('duration'),
      radiusMiles:260
    });
    window.TXDRRunScenarioPipeline.runScenarioPipeline({
      impacts:impacts,
      resources:resourceData||{},
      containerId:'resourceImpactResults'
    });
  }

  function boot(){
    fetch('public/data/texas_county_resources.json').then(function(r){return r.ok?r.json():{};}).then(function(data){resourceData=data||{};}).catch(function(){resourceData={};}).finally(function(){
      var form=document.getElementById('scenarioForm');
      if(form)form.addEventListener('submit',function(){setTimeout(runFullPipeline,150);});
      var sample=document.getElementById('useSamplePath');
      if(sample)sample.addEventListener('click',function(){setTimeout(runFullPipeline,200);});
      setTimeout(runFullPipeline,800);
    });
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
