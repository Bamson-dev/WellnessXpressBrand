export type DeliveryOption = { fee: number; eta: string; note?: string };

const STATE_FEES: Record<string, number> = {
  Niger: 7500, Benue: 7500, Nasarawa: 7500, Plateau: 7500, Kogi: 7500,
  Jigawa: 7500, Kaduna: 7500, Katsina: 7500, Zamfara: 7500, Sokoto: 7500,
  Kebbi: 7500, Gombe: 7500, Bauchi: 7500, Yobe: 7500, Kano: 7500,
  Borno: 7500, Adamawa: 7500, Taraba: 7500,
  FCT: 5000, Abuja: 5000, "FCT (Abuja)": 5000,
  Ogun: 5500, Oyo: 5500, Ekiti: 5500, Osun: 5500, Ondo: 5500,
  Enugu: 6500, Imo: 6500, Anambra: 6500, Ebonyi: 6500, Abia: 6500,
  Rivers: 6500, Bayelsa: 6500, Delta: 6500, Edo: 6500, Kwara: 6500,
  "Cross River": 7500, "Akwa Ibom": 7500,
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
