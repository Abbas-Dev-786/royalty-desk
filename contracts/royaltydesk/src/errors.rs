use near_sdk::env;
pub fn fail(code: &str) -> ! { env::panic_str(code) }
