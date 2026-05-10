(function(){
  var ercotBaseline=null;

  function loadErcotBaseline(){
    return fetch('public/data/ercot/ercot_zone_vulnerability.json')
      .then(function(r){ return r.ok ? r.json() : null; })
      .then(function(data){ ercotBaseline=data||null; return ercotBaseline; })
      .catch(function(){ ercotBaseline=null; return null; });
  }

  function scorePriority(avgOutage,maxHazard,baseline){
    var score=(avgOutage*0.38)+(maxHazard*0.34)+(baseline.baselineVulnerability*0.28);
    if(score>=80) return 'Critical';
    if(score>=65) return 'High';
    if(score>=45) return 'Elevated';
    return 'Moderate';
  }

  function rollupErcotZones(impacts){
    var zones=((ercotBaseline||{}).zones)||{};
    var grouped={};
    (impacts||[]).forEach(function(item){
      var zone=item.ercotZone||'Unknown';
      if(!grouped[zone]) grouped[zone]={ zone:zone, counties:0, outageTotal:0, maxHazard:0 };
      grouped[zone].counties+=1;
      grouped[zone].outageTotal+=Number(item.outagePercent||0);
      grouped[zone].maxHazard=Math.max(grouped[zone].maxHazard, Number(item.hazard||0));
    });

    return Object.keys(grouped).map(function(zone){
      var baseline=zones[zone]||zones.Unknown||{ baselineVulnerability:40 };
      var avgOutage=Math.round(grouped[zone].outageTotal/grouped[zone].counties);
      return {
        zone:zone,
        countiesImpacted:grouped[zone].counties,
        averageOutage:avgOutage,
        maxHazard:grouped[zone].maxHazard,
        baselineVulnerability:baseline.baselineVulnerability,
        restorationPriority:scorePriority(avgOutage, grouped[zone].maxHazard, baseline)
      };
    }).sort(function(a,b){ return b.maxHazard-a.maxHazard; });
  }

  function renderErcotOverlay(containerId, impacts){
    var el=document.getElementById(containerId||'ercotGridResults');
    if(!el) return;
    var zones=rollupErcotZones(impacts);
    el.innerHTML=zones.map(function(zone){
      return '<div class="card"><div class="label">ERCOT '+zone.zone+'</div><div class="value">'+zone.restorationPriority+'</div><div>Counties: '+zone.countiesImpacted+'</div><div>Avg Outage: '+zone.averageOutage+'%</div><div>Max Hazard: '+zone.maxHazard+'</div></div>';
    }).join('');
  }

  loadErcotBaseline();

  if(typeof module!=='undefined') module.exports={loadErcotBaseline,rollupErcotZones,renderErcotOverlay};
  if(typeof window!=='undefined') window.TXDRErcotGridOverlay={loadErcotBaseline,rollupErcotZones,renderErcotOverlay};
})();
