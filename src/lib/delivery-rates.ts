export type DeliveryOption = { fee: number; eta: string; note?: string };

const STATE_FEES: Record<string, number> = {
  Niger: 0, Benue: 0, Nasarawa: 0, Plateau: 0, Kogi: 0, Jigawa: 0,
  Kaduna: 0, Katsina: 0, Zamfara: 0, Sokoto: 0, Kebbi: 0, Gombe: 0,
  Bauchi: 0, Yobe: 0, Kano: 0, Borno: 0, Adamawa: 0, Taraba: 0,
  FCT: 5000, Abuja: 5000, "FCT (Abuja)": 5000,
  Ogun: 0, Oyo: 0, Ekiti: 0, Osun: 0, Ondo: 0,
  Enugu: 0, Imo: 0, Anambra: 0, Ebonyi: 0, Abia: 0, Rivers: 0,
  Bayelsa: 0, Delta: 0, Edo: 0, Kwara: 0,
  "Cross River": 0, "Akwa Ibom": 0,
};

const LAGOS: Record<string, DeliveryOption> = {};
function put(areas: string[], fee: number, note = "") {
  for (const area of areas) {
    const key = area.trim().toLowerCase();
    // If the source data lists an area in multiple zones, keep the higher fee.
    const prior = LAGOS[key];
    if (!prior || fee > prior.fee) LAGOS[key] = { fee, eta: "1–3 working days", ...(note ? { note } : {}) };
  }
}
put(["Okota","Ago Palace","Ilasamaja","Ajao Estate","Oshodi","Isolo","Orile Iganmu","Bariga","Shomolu","Surulere","Ebute Meta","Yaba","Akoka","Obanikoro","Fadeyi","Onipanu","Jibowu","Ikeja","Maryland","Anthony","Ojota","Ogudu","Gbagada","Oworonshoki","Ketu","Shangisha","Magodo Phase 2"], 3000);
put(["Egbeda","Dopemu","Ogba","Ejigbo","Festac","Mile 2","Cement","Shasha","Mushin","Ilupeju","Ojodu Berger","Omole Phase 1","Magodo Phase 1","Agege","Ikotun","Idimu","Apapa","Ajegunle","Mangoro"], 3500);
put(["Command","Ipaja","Ayobo","Abule Egba","Alagbado","Fagba","Ifako Ijaiye","Iju-Ishaga","Kola","Alakuko","Mile 12","Igando","Isheri-Olofin","Agbado-Ijaiye","Ojokoro","Ijegun","Ikorodu"], 4000, "Extra charges may apply for extreme locations or bulky packages.");
put(["Ojo","Ajangbadi","Alaba","Iba","Oko Afo","LASU","Okokomaiko","Igbo Elerin","Amuwo Odofin","Satellite Town","Abule Osun","Abule Ado","Agboju","Kirikiri","Tradefair"], 4000, "Extra charges may apply for bulky packages or extreme locations.");
put(["CMS","Obalende","Victoria Island","Ikoyi","Falomo","Lagos Island","Idumota"], 4000);
put(["Agungi","Oniru","Lekki Phase 1","Chevron","Ikate","Elegushi","VGC","Alpha Beach","Jakande","Ikota","Marwa","Osapa","Orchid","Igbo Efon"], 4000, "Extra charges may apply for extreme locations or bulky packages.");
put(["Ogombo","Abraham Adesanya","Thomas Estate","Badore","Ilaje","Ado Road","Ajah","Mobil","Eleganza","Lekki County Homes","LBS","Sangotedo","Abijo","Awoyaya"], 5000, "Extra charges may apply for extreme locations.");
put(["Ibeju","Mayfair","Epetu","Lakowe","Gbogije"], 6000);

export function getStateDeliveryFee(state: string): number | null {
  if (/^(lagos)$/i.test(state)) return null;
  return STATE_FEES[state] ?? null;
}
export function getLagosDelivery(area: string): DeliveryOption | null {
  return LAGOS[area.trim().toLowerCase()] ?? null;
}
export const LAGOS_DELIVERY_AREAS = Object.keys(LAGOS).sort((a, b) => a.localeCompare(b));
