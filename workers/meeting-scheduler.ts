import { runMeetingAutomation } from '../db/meeting-automation';
const scheduler={async scheduled(controller:ScheduledController){await runMeetingAutomation(controller.scheduledTime);}};

export default scheduler;
