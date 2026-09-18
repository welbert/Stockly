/// Money as float, rounded to 2 decimals after every operation (sum, discount).
/// Small, accepted rounding drift on sequential item+order discounts.
pub(crate) fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

/// `R$ 1.234,56` (pt-BR thousands `.`, decimal `,`) — shared by every PDF
/// generator (`commands::receipts`, `pdf_util`) so a receipt and a report
/// never format money differently.
pub(crate) fn fmt_money(value: f64) -> String {
    let negative = value < 0.0;
    let cents = (value.abs() * 100.0).round() as i64;
    let (reais, cents) = (cents / 100, cents % 100);
    let digits: Vec<char> = reais.to_string().chars().rev().collect();
    let mut grouped = String::new();
    for (i, c) in digits.iter().enumerate() {
        if i > 0 && i % 3 == 0 {
            grouped.push('.');
        }
        grouped.push(*c);
    }
    let reais_str: String = grouped.chars().rev().collect();
    format!("{}R$ {reais_str},{cents:02}", if negative { "-" } else { "" })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round2_avoids_float_residue() {
        assert_eq!(round2(19.9), 19.9);
        assert_eq!(round2(19.999), 20.0);
        assert_eq!(round2(0.1 + 0.2), 0.3);
    }

    #[test]
    fn fmt_money_groups_thousands_and_pads_cents() {
        assert_eq!(fmt_money(1234.5), "R$ 1.234,50");
        assert_eq!(fmt_money(0.0), "R$ 0,00");
        assert_eq!(fmt_money(-24.0), "-R$ 24,00");
    }
}
