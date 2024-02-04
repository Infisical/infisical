/**
 * Time since a certain date
 * @param {Date} date - the timestamp got which we want to understand how long ago it happened
 * @returns {String} text - how much time has passed since a certain timestamp
 */
function timeSince(date: Date) {
  const seconds = Math.floor(
    ((new Date() as any) - (date as any)) / 1000
  ) as number;

  let interval = seconds / 31536000;

  if (interval > 1) {
    return `${Math.floor(interval)  } years ago`;
  }
  interval = seconds / 2592000;
  if (interval > 1) {
    return `${Math.floor(interval)  } months ago`;
  }
  interval = seconds / 86400;
  if (interval > 1) {
    return `${Math.floor(interval)  } days ago`;
  }
  interval = seconds / 3600;
  if (interval > 1) {
    return `${Math.floor(interval)  } hours ago`;
  }
  interval = seconds / 60;
  if (interval > 1) {
    return `${Math.floor(interval)  } minutes ago`;
  }
  return `${Math.floor(seconds)  } seconds ago`;
}

export default timeSince;
