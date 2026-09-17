/// Money as float, rounded to 2 decimals after every operation (sum, discount).
/// Small, accepted rounding drift on sequential item+order discounts.
pub(crate) fn round2(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
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
}
