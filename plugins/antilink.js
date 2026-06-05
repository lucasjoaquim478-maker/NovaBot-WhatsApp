const linkPattern = /(https?:\/\/|www\.)[^\s]+/gi;
const blockedDomains = [
  'chat.whatsapp.com', 'wa.me', 'bit.ly', 'tinyurl.com', 'is.gd', 't.co',
  'youtu.be', 'youtube.com', 'instagram.com', 'tiktok.com', 'facebook.com'
];

function containsLink(text) {
  linkPattern.lastIndex = 0;
  return linkPattern.test(text);
}

function containsBlockedDomain(text) {
  const lower = text.toLowerCase();
  return blockedDomains.some(d => lower.includes(d));
}

module.exports = { containsLink, containsBlockedDomain };
