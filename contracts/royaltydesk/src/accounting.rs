use crate::models::{AgreementProposal, Entitlement, EntitlementStatus, ParticipantShare};

pub fn allocate(gross: u128, recoupment_remaining: u128, participants: &[ParticipantShare], beneficiary: Option<&near_sdk::AccountId>) -> Vec<Entitlement> {
    let recouped = gross.min(recoupment_remaining);
    let distributable = gross - recouped;
    let mut rows: Vec<(near_sdk::AccountId, u128, u128)> = participants.iter().map(|p| {
        let quotient = distributable / 10_000;
        let remainder = distributable % 10_000;
        let basis = u128::from(p.basis_points);
        let amount = quotient * basis + (remainder * basis) / 10_000;
        let fractional = (remainder * basis) % 10_000;
        (p.owner_id.clone(), amount, fractional)
    }).collect();
    let base_total: u128 = rows.iter().map(|(_, amount, _)| *amount).sum();
    let mut remainder = distributable - base_total;
    rows.sort_by(|left, right| right.2.cmp(&left.2).then_with(|| left.0.cmp(&right.0)));
    for row in rows.iter_mut() { if remainder == 0 { break; } row.1 += 1; remainder -= 1; }
    rows.sort_by(|left, right| left.0.cmp(&right.0));
    let mut result: Vec<Entitlement> = rows.into_iter().map(|(owner_id, amount, _)| Entitlement { owner_id, amount_yocto: amount, status: EntitlementStatus::Available, attempt_id: 0 }).collect();
    if recouped > 0 { if let Some(beneficiary_id) = beneficiary { if let Some(row) = result.iter_mut().find(|row| &row.owner_id == beneficiary_id) { row.amount_yocto += recouped; } } }
    result
}

pub fn recoupment_remaining(agreement: &AgreementProposal) -> u128 { agreement.recoupment.as_ref().map(|r| r.cap_yocto.saturating_sub(r.consumed_yocto)).unwrap_or(0) }
