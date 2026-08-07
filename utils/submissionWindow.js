/**
 * "Kya is event mein abhi activity submit kar sakte hain?"
 *
 * Ye rule pehle activity-submission page ke andar tha. Ab profile se bhi
 * submit hota hai, isliye yahan la diya — dono jagah bilkul ek jaisa
 * jawab mile, warna ek page button dikhaye aur doosra reject kar de.
 *
 * Rule: submission tabhi khulta hai jab REGISTRATION band ho jaye.
 */
const submissionWindow = (event) => {
  if (!event) return { open: false, reason: "Event not found" };

  const now = new Date();

  if (event.isPrevious) {
    return { open: false, reason: "This event has ended" };
  }

  if (event.submissionDeadline && now > new Date(event.submissionDeadline)) {
    return { open: false, reason: "Submissions are closed for this event" };
  }

  const regDeadline       = event.registrationDeadline ? new Date(event.registrationDeadline) : null;
  const regDeadlinePassed = regDeadline ? regDeadline < now : false;
  const registrationOpen  = event.isRegistrationOpen === true && !regDeadlinePassed;

  if (registrationOpen) {
    return {
      open:   false,
      reason: "Submissions open once registration closes",
      opensAfter: regDeadline,
    };
  }

  return { open: true, closesOn: event.submissionDeadline || null };
};

module.exports = { submissionWindow };
