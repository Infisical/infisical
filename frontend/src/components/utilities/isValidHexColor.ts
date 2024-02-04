export  const isValidHexColor = (hexColor: string) => {
    const hexColorPattern = /^#?([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
  
    return hexColorPattern.test(hexColor);
}