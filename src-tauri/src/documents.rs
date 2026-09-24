//! CPF/CNPJ format and check-digit validation for `clients.document_number`.
//!
//! CNPJ can now be alphanumeric (Receita Federal's new format): the first 12
//! characters may be digits or uppercase letters, only the last 2 (check
//! digits) stay numeric. Each character's value for the checksum is its ASCII
//! code minus 48 (digits keep their value 0-9, `'A'..'Z'` become 17-42) — same
//! modulus-11 algorithm as the classic numeric CNPJ, just generalized to that
//! wider value range.

/// Cyclic weight table for the CNPJ checksum, 2-9 repeating from the
/// rightmost of the 12 base characters. Index `i+1` gives the weight for
/// character `i` when computing the first check digit; index `i` gives it for
/// the second (which also folds in the first check digit at index 12).
const CNPJ_WEIGHTS: [u32; 13] = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/// Uppercases and strips anything that isn't a letter or digit — the only
/// form `document_number` is ever stored in, regardless of how it was typed
/// or pasted on the frontend.
pub fn normalize_document(raw: &str) -> String {
    raw.chars().filter(|c| c.is_ascii_alphanumeric()).map(|c| c.to_ascii_uppercase()).collect()
}

/// `value` must already be normalized (11 chars, uppercase-irrelevant since
/// CPF is digits-only).
pub fn validate_cpf(value: &str) -> Result<(), String> {
    let digits: Vec<u32> = match value.chars().map(|c| c.to_digit(10)).collect::<Option<_>>() {
        Some(d) => d,
        None => return Err("CPF inválido".to_string()),
    };
    if digits.len() != 11 {
        return Err("CPF inválido".to_string());
    }
    // Blocks obviously-fake sequences (000.000.000-00, 111.111.111-11, ...)
    // that would otherwise pass the checksum below.
    if digits.iter().all(|d| *d == digits[0]) {
        return Err("CPF inválido".to_string());
    }
    let dv1 = cpf_check_digit(&digits[0..9], 10);
    let dv2 = cpf_check_digit(&digits[0..10], 11);
    if digits[9] != dv1 || digits[10] != dv2 {
        return Err("CPF inválido".to_string());
    }
    Ok(())
}

/// `start_weight` is the weight applied to the first digit, descending by 1
/// per position — the two CPF check digits differ only in this starting
/// weight (10, then 11).
fn cpf_check_digit(digits: &[u32], start_weight: u32) -> u32 {
    let sum: u32 = digits.iter().enumerate().map(|(i, d)| d * (start_weight - i as u32)).sum();
    let remainder = sum % 11;
    if remainder < 2 {
        0
    } else {
        11 - remainder
    }
}

/// `value` must already be normalized (14 uppercase alphanumeric chars, last
/// 2 numeric).
pub fn validate_cnpj(value: &str) -> Result<(), String> {
    let chars: Vec<char> = value.chars().collect();
    if chars.len() != 14 {
        return Err("CNPJ inválido".to_string());
    }
    if !chars[..12].iter().all(|c| c.is_ascii_alphanumeric()) || !chars[12..].iter().all(|c| c.is_ascii_digit()) {
        return Err("CNPJ inválido".to_string());
    }
    // The all-zero base is explicitly invalid, same as CPF's repeated-digit
    // block above — mathematically it would compute a "valid" pair of check
    // digits, but it was never actually issued.
    if chars[..12].iter().all(|c| *c == '0') {
        return Err("CNPJ inválido".to_string());
    }

    let values: Vec<u32> = chars[..12].iter().map(|c| (*c as u32) - 48).collect();
    let mut sum1 = 0u32;
    let mut sum2 = 0u32;
    for (i, v) in values.iter().enumerate() {
        sum1 += v * CNPJ_WEIGHTS[i + 1];
        sum2 += v * CNPJ_WEIGHTS[i];
    }
    let dv1 = {
        let r = sum1 % 11;
        if r < 2 {
            0
        } else {
            11 - r
        }
    };
    sum2 += dv1 * CNPJ_WEIGHTS[12];
    let dv2 = {
        let r = sum2 % 11;
        if r < 2 {
            0
        } else {
            11 - r
        }
    };

    let expected_dv1 = chars[12].to_digit(10).unwrap();
    let expected_dv2 = chars[13].to_digit(10).unwrap();
    if dv1 != expected_dv1 || dv2 != expected_dv2 {
        return Err("CNPJ inválido".to_string());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_mask_and_case() {
        assert_eq!(normalize_document("123.456.789-09"), "12345678909");
        assert_eq!(normalize_document("12.abc.345/01de-35"), "12ABC34501DE35");
    }

    #[test]
    fn accepts_a_known_valid_cpf() {
        assert!(validate_cpf("11144477735").is_ok());
    }

    #[test]
    fn rejects_wrong_length_or_check_digit_or_repeated_cpf() {
        assert!(validate_cpf("1114447773").is_err());
        assert!(validate_cpf("11144477736").is_err());
        assert!(validate_cpf("11111111111").is_err());
    }

    #[test]
    fn accepts_known_valid_alphanumeric_and_numeric_cnpjs() {
        // Examples from Receita Federal/SERPRO's official alphanumeric CNPJ
        // reference material.
        assert!(validate_cnpj("12ABC34501DE35").is_ok());
        assert!(validate_cnpj("ABCDEFGHIJKL80").is_ok());
        assert!(validate_cnpj("00000000000191").is_ok());
        assert!(validate_cnpj("90021382000122").is_ok());
    }

    #[test]
    fn rejects_zeroed_wrong_length_or_wrong_check_digit_cnpj() {
        assert!(validate_cnpj("00000000000000").is_err());
        assert!(validate_cnpj("0000000000019").is_err());
        assert!(validate_cnpj("ABCDEFGHIJKL81").is_err());
        assert!(validate_cnpj("00000000000192").is_err());
    }
}
