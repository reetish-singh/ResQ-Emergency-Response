import {MapContainer,TileLayer,Marker,Popup} from "react-leaflet";
export default function ResponderLiveMap({locations=[]}){
 const valid=locations.filter(x=>Number.isFinite(x.latitude)&&Number.isFinite(x.longitude));
 const center=valid.length?[valid[0].latitude,valid[0].longitude]:[24.88,74.62];
 return <div style={{height:340,width:"100%",borderRadius:12,overflow:"hidden"}}><MapContainer center={center} zoom={valid.length?11:8} style={{height:"100%",width:"100%"}}><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>{valid.map(x=><Marker key={x._id} position={[x.latitude,x.longitude]}><Popup>{x.responder?.name||"Responder"}<br/>{new Date(x.updatedAt).toLocaleString()}</Popup></Marker>)}</MapContainer></div>;
}
