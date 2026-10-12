import com.cartlyft.momowala.OpeningSchedule;
import java.time.Instant;
public class OpeningScheduleTest {
 static long at(String s){return Instant.parse(s).toEpochMilli();}
 static void check(boolean b,String s){if(!b)throw new AssertionError(s);}
 public static void main(String[] args){
  long before=at("2026-10-13T09:00:00Z"); // 14:30 IST
  check(OpeningSchedule.next("16:00",before,"",false)==at("2026-10-13T10:00:00Z"),"30 minutes early");
  long due=at("2026-10-13T10:00:00Z");
  check(OpeningSchedule.next("16:00",due,"",true)==due+300000,"repeat until complete");
  check(OpeningSchedule.next("16:00",due,"2026-10-13",true)==at("2026-10-14T10:00:00Z"),"tomorrow after completion");
  long midnight=at("2026-12-31T18:15:00Z"); // 23:45 IST
  check(OpeningSchedule.date(OpeningSchedule.businessOpening("00:15",midnight)).equals("2027-01-01"),"midnight business date");
  check(OpeningSchedule.next("00:15",midnight,"2027-01-01",false)==at("2027-01-01T18:15:00Z"),"next midnight alarm");
  long late=at("2026-10-13T15:00:00Z");
  check(OpeningSchedule.next("16:00",late,"",true)==late+300000,"no premature cutoff");
  System.out.println("PASS: opening timing, completion, repeat and midnight/year rollover");
 }
}
