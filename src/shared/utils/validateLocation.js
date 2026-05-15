function validateLocation(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return { valid: false };
  }

  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { valid: false };
  }

  return { valid: true, lat, lng };
}

module.exports = { validateLocation };
