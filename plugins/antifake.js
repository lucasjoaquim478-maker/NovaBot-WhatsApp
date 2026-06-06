function isFakeNumber(jid, allowedCountries = ['55']) {
  const number = jid.replace('@s.whatsapp.net', '');
  const countryCode = number.slice(0, 2);
  return !allowedCountries.includes(countryCode);
}

module.exports = { isFakeNumber };
