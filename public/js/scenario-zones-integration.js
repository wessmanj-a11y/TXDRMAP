(function(){
  function countyKey(name){return String(name||'').replace(/\s+/g,'').replace(/[^A-Za-z]/g,'');}
  function pointForCounty(name){
    var map={Galveston:[29.3013,-94.7977],Harris:[29.7604,-95.3698],Montgomery:[30.3213,-95.4778],Walker:[30.7235,-95.5508],Madison:[30.9499,-95.9116],Dallas:[32.7767,-96.7970],Tarrant:[32.7555,-97.3308],Bexar:[29.4241,-98.4936],Travis:[30.2672,-97.7431],Collin:[33.1795,-96.4930],Denton:[33.2148,-97.1331],FortBend:[29.5693,-95.8143],Hidalgo:[26.1004,-98.2631],ElPaso:[31.7619,-106.4850],Brazoria:[29.1694,-95.4344]};
    var p=map[countyKey(name)];
    return p?{lat:p[0],lng:p[1]}:null;
  }
  function displayCounty(key){if(key==='FortBend')return'Fort Bend';if(key==='ElPaso')return'El Paso';return key.replace(/([A-Z])/g,' $1').trim();}
  function allCountyData(){
    return Object.keys({Galveston:1,Harris:1,Montgomery:1,Walker:1,Madison:1,Dallas:1,Tarrant:1,Bexar:1,Travis:1,Collin:1,Denton:1,FortBend:1,Hidalgo:1,ElPaso:1,Brazoria:1}).map(function(k){var p=pointForCounty(k);return{name:displayCounty(k),centroid:p,population:0};});
  }
  function currentPathPoints(){
    var text=document.getElementById('trackCounties');
    if(!text)return[];
    return text.value.split(',').map(function(c){return pointForCounty(c.trim());}).filter(Boolean);
  }
  window.drawStormCorridorZones=function(){
    if(!window.scenarioMap||!window.TXDRScenarioZones)return;
    var path=currentPathPoints();
    if(path.length<2)return;
    var impacted=window.TXDRScenarioZones.buildImpactZones(path,allCountyData(),{majorRadiusMiles:45,severeRadiusMiles:100,moderateRadiusMiles:175,elevatedRadiusMiles:260});
    window.TXDRScenarioZones.drawScenarioZones(window.scenarioMap,impacted);
  };
  document.addEventListener('DOMContentLoaded',function(){
    setTimeout(window.drawStormCorridorZones,1000);
    var form=document.getElementById('scenarioForm');
    if(form)form.addEventListener('submit',function(){setTimeout(window.drawStormCorridorZones,100);});
    var sample=document.getElementById('useSamplePath');
    if(sample)sample.addEventListener('click',function(){setTimeout(window.drawStormCorridorZones,100);});
    var clear=document.getElementById('clearPath');
    if(clear)clear.addEventListener('click',function(){if(window.scenarioZoneLayers){window.scenarioZoneLayers.forEach(function(layer){window.scenarioMap.removeLayer(layer);});window.scenarioZoneLayers=[];}});
  });
})();
