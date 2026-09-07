(function(){
  function normalizeCountyName(name){
    return String(name||'').replace(/ County$/i,'').trim();
  }

  function getCountyName(feature){
    if(!feature||!feature.properties)return '';
    return normalizeCountyName(feature.properties.NAME || feature.properties.NAMELSAD || feature.properties.name || '');
  }

  function styleFeature(metricValue){
    var value=Number(metricValue)||0;
    var fill='#1d4ed8';
    if(value>=80) fill='#7f1d1d';
    else if(value>=60) fill='#dc2626';
    else if(value>=40) fill='#f97316';
    else if(value>=20) fill='#eab308';
    else if(value>0) fill='#22c55e';
    return {
      color:'#94a3b8',
      weight:1,
      fillColor:fill,
      fillOpacity:0.58
    };
  }

  function renderCountyPolygons(options){
    var map=options.map;
    var geojson=options.geojson;
    var impacts=options.impacts||[];
    var metric=options.metric||'hazard';
    var onCountyClick=options.onCountyClick;
    if(!map||!geojson||typeof L==='undefined') return null;

    var impactLookup={};
    impacts.forEach(function(item){ impactLookup[normalizeCountyName(item.county)] = item; });

    return L.geoJSON(geojson,{
      style:function(feature){
        var county=getCountyName(feature);
        var impact=impactLookup[county];
        return styleFeature(impact ? impact[metric] : 0);
      },
      onEachFeature:function(feature,layer){
        var county=getCountyName(feature);
        var impact=impactLookup[county]||{};
        layer.bindTooltip(
          county +
          '<br>Hazard: ' + (impact.hazard||0) +
          '<br>Outage: ' + (impact.outagePercent||0) + '%'+
          '<br>Road: ' + (impact.roadPercent||0) + '%'+
          '<br>Telco: ' + (impact.telcoPercent||0) + '%'
        );
        layer.on('click',function(){
          if(onCountyClick) onCountyClick(county, feature, impact);
        });
      }
    }).addTo(map);
  }

  function loadTexasCountyGeoJSON(url){
    return fetch(url).then(function(r){
      if(!r.ok) throw new Error('Failed to load county polygons');
      return r.json();
    });
  }

  if(typeof module!=='undefined') module.exports={loadTexasCountyGeoJSON,renderCountyPolygons};
  if(typeof window!=='undefined') window.TXDRTexasCountyPolygons={loadTexasCountyGeoJSON,renderCountyPolygons};
})();
