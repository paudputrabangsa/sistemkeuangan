import type { DiskonItem } from '../db/types';
import { formatNumberInput } from './format';

export function getPromoValue(promo: DiskonItem, targetId: string) {
  if (promo.potongan_per_target && promo.potongan_per_target[targetId]) {
    return promo.potongan_per_target[targetId];
  }
  if (promo.potongan_per_target && promo.potongan_per_target['semua']) {
    return promo.potongan_per_target['semua'];
  }
  return {
    tipe_diskon: promo.tipe_diskon,
    persen_diskon: promo.persen_diskon,
    nominal_diskon: promo.nominal_diskon,
  };
}

export function getPromoNilaiDisplay(d: DiskonItem): string {
  const targets = d.target_jenis_tagihan?.length ? d.target_jenis_tagihan : [d.jenis_tagihan || 'semua'];
  if (targets.length === 0) return '-';
  
  const firstTarget = targets[0];
  const ptFirst = getPromoValue(d, firstTarget);
  
  let isSame = true;
  for (const t of targets) {
    const pt = getPromoValue(d, t);
    if (pt.tipe_diskon !== ptFirst.tipe_diskon || pt.persen_diskon !== ptFirst.persen_diskon || pt.nominal_diskon !== ptFirst.nominal_diskon) {
      isSame = false;
      break;
    }
  }

  if (isSame) {
    if (ptFirst.tipe_diskon === 'persen') return `${ptFirst.persen_diskon}%`;
    return `Rp ${formatNumberInput(ptFirst.nominal_diskon)}`;
  }
  
  return 'Bervariasi (per target)';
}
